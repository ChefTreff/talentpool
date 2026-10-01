-- 0226 · Kiosk-Gerätekonto im Admin anlegen: nur Team-Adressen, Rolle checkin_operator je Edition (ADM-038)
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001082940.
--
-- Zweck: Die Rolle `checkin_operator` liess sich vergeben, das Konto dazu
-- entstand aber von Hand in Supabase. Jetzt legt der Admin unter Zugänge ein
-- Gerätekonto an: Person, Team-Adresse, Rolle für die Edition — die
-- Anmelde-Mail schickt danach die Server-Aktion.
--
-- Regeln aus E8 (Arbeitsauftrag Welle 4, bestätigt):
--   * ein Konto je Gerät, **nur** `checkin_operator`, Scope Edition;
--   * Anmeldung per Magic-Link auf **Team-Adressen** — deshalb nur
--     `@chef-treff.de`. Eine frei eingetippte Adresse wäre der Weg, einer
--     fremden Person Einlass-Rechte zu geben (P0001 `team_address_required`);
--   * die Rolle endet mit der Edition (Folgetag 00:00 Europe/Berlin).
--
-- Gehört die Adresse schon einer Person, die irgendeine andere Rolle trägt
-- oder trug, wird sie **nicht** zum Gerät umgebaut (P0001 `kiosk_email_in_use`):
-- ein Mensch verlöre sonst unbemerkt seine Sicht, denn `is_kiosk_only()`
-- schaltet alles andere ab. Ein bestehendes Gerätekonto wird dagegen für die
-- Edition verlängert — derselbe Knopf im nächsten Jahr.
--
-- Die Person bekommt kein Konto in dieser Funktion; das Auth-Konto entsteht
-- über die Einladung, und der Login-Rückweg verknüpft es über die bestätigte
-- Adresse (`claim_or_create_person`).
set search_path = public, extensions;

create or replace function create_kiosk_account(p_label text, p_email text, p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_end date; v_valid_to timestamptz; v_pid uuid; v_neu boolean := false; v_blocked timestamptz;
  v_rolle uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('access') then raise exception 'not allowed' using errcode = '42501'; end if;

  if v_label is null then raise exception 'label_required' using errcode = '22023'; end if;
  if v_email is null or v_email !~ '^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023', detail = coalesce(v_email, 'null');
  end if;
  if v_email !~ '@chef-treff\.de$' then
    raise exception 'team_address_required' using errcode = 'P0001', detail = v_email;
  end if;

  select e.end_date into v_end from event e where e.id = p_edition_id and e.is_edition;
  if not found then
    raise exception 'edition_not_found' using errcode = 'P0002', detail = coalesce(p_edition_id::text, 'null');
  end if;
  if v_end is null or v_end < current_date then
    raise exception 'edition_over' using errcode = 'P0001', detail = coalesce(v_end::text, 'kein Enddatum');
  end if;
  v_valid_to := ((v_end + 1)::timestamp at time zone 'Europe/Berlin');

  select pe.person_id, p.access_blocked_at into v_pid, v_blocked
    from person_email pe join person p on p.id = pe.person_id
   where lower(pe.email::text) = v_email and p.deleted_at is null
   limit 1;

  if v_pid is not null then
    if exists (select 1 from role_assignment ra where ra.person_id = v_pid and ra.role <> 'checkin_operator') then
      raise exception 'kiosk_email_in_use' using errcode = 'P0001', detail = v_email;
    end if;
    if v_blocked is not null then
      raise exception 'access_blocked' using errcode = 'P0001', detail = v_email;
    end if;
  else
    insert into person (first_name, last_name, source_first)
    values ('Kiosk', v_label, 'admin')
    returning id into v_pid;
    insert into person_email (person_id, email, is_primary, verified)
    values (v_pid, v_email, true, false);
    v_neu := true;
  end if;

  select ra.id into v_rolle from role_assignment ra
   where ra.person_id = v_pid and ra.role = 'checkin_operator'
     and ra.scope_type = 'edition' and ra.edition_id = p_edition_id;
  if v_rolle is not null then
    update role_assignment set valid_to = v_valid_to, valid_from = least(valid_from, now()),
           granted_by = current_person_id(), note = 'Gerätekonto: ' || v_label
     where id = v_rolle;
  else
    insert into role_assignment (person_id, role, scope_type, edition_id, valid_to, granted_by, note)
    values (v_pid, 'checkin_operator', 'edition', p_edition_id, v_valid_to, current_person_id(),
            'Gerätekonto: ' || v_label);
  end if;

  perform log_audit('access.kiosk_account', 'person', v_pid::text, null,
                    jsonb_build_object('email', v_email, 'label', v_label, 'edition_id', p_edition_id,
                                       'valid_to', v_valid_to, 'new', v_neu));
  return jsonb_build_object('person_id', v_pid, 'email', v_email, 'created', v_neu,
                            'has_login', exists (select 1 from person p where p.id = v_pid and p.auth_user_id is not null));
end $$;

select harden_definer_functions();
