-- Teammitglied anlegen und einladen in einem Schritt (QS-056, Team-Testrunde ab 06.10.)
--
-- Zweck: Unter Verwaltung → Zugänge konnte Konrad nur Personen einladen, die
-- es schon gab; ein neues Teammitglied entstand erst, wenn es sich selbst
-- angemeldet hatte, und bekam die Rollen danach unter /admin/team. Der
-- Testleitfaden (docs/team-testleitfaden.md) sagt: „Konrad legt dich unter
-- Verwaltung → Zugänge an und vergibt deine Rollen." Diese Funktion macht
-- genau das: Person (oder vorhandene Person zur Adresse), Rollen für die
-- Edition, Audit. Die Einladungs-Mail schickt danach die Server-Action an die
-- Adresse **aus der Datenbank** (wie `ladeEin`).
--
-- Grenzen:
--   * nur Abschnitt `access` (nur admin) — und die Rollen über `assign_role`,
--     das `has_role('admin')` noch einmal prüft;
--   * nur Team-Rollen aus `team_role_keys()`, **ohne** `admin`: Admin wird
--     niemand über ein Einladungsformular, sondern bewusst unter /admin/team;
--   * eine gesperrte Person bleibt gesperrt (`access_blocked`), eine gelöschte
--     wird nicht wiederbelebt (neue Person);
--   * schon vorhandene aktive Rollen werden nicht verdoppelt.
set search_path = public, extensions;

create or replace function create_team_member(p_first_name text, p_last_name text, p_email text,
                                              p_roles text[], p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_first text := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last text := nullif(btrim(coalesce(p_last_name, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_pid uuid; v_blocked timestamptz; v_neu boolean := false; v_rolle text; v_vergeben text[] := '{}';
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('access') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_first is null or v_last is null then raise exception 'name_required' using errcode = '22023'; end if;
  if v_email is null or v_email !~ '^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023', detail = coalesce(v_email, 'null');
  end if;
  if coalesce(cardinality(p_roles), 0) = 0 then raise exception 'roles_required' using errcode = '22023'; end if;
  foreach v_rolle in array p_roles loop
    if v_rolle = 'admin' or not (v_rolle = any (team_role_keys())) then
      raise exception 'invalid_role' using errcode = '22023', detail = v_rolle;
    end if;
  end loop;
  if not exists (select 1 from event e where e.id = p_edition_id and e.is_edition) then
    raise exception 'edition_not_found' using errcode = 'P0002';
  end if;

  select pe.person_id, p.access_blocked_at into v_pid, v_blocked
    from person_email pe join person p on p.id = pe.person_id
   where lower(pe.email::text) = v_email and p.deleted_at is null
   limit 1;
  if v_pid is not null then
    if v_blocked is not null then raise exception 'access_blocked' using errcode = 'P0001', detail = v_email; end if;
    update person set first_name = coalesce(first_name, v_first), last_name = coalesce(last_name, v_last) where id = v_pid;
  else
    insert into person (first_name, last_name, source_first) values (v_first, v_last, 'admin') returning id into v_pid;
    insert into person_email (person_id, email, is_primary, verified) values (v_pid, v_email, true, false);
    v_neu := true;
  end if;

  foreach v_rolle in array (select array_agg(distinct r) from unnest(p_roles) r) loop
    continue when exists (
      select 1 from role_assignment ra
       where ra.person_id = v_pid and ra.role = v_rolle and ra.scope_type = 'edition' and ra.edition_id = p_edition_id
         and (ra.valid_to is null or ra.valid_to > now()));
    perform assign_role(v_pid, v_rolle, 'edition', null, p_edition_id, null, null, null, 'Team-Einladung (Verwaltung → Zugänge)');
    v_vergeben := v_vergeben || v_rolle;
  end loop;

  perform log_audit('access.team_member', 'person', v_pid::text, null,
                    jsonb_build_object('email', v_email, 'roles', to_jsonb(v_vergeben), 'edition_id', p_edition_id, 'new', v_neu));
  return jsonb_build_object('person_id', v_pid, 'email', v_email, 'created', v_neu, 'roles', to_jsonb(v_vergeben),
                            'has_login', exists (select 1 from person p where p.id = v_pid and p.auth_user_id is not null));
end $$;

select harden_definer_functions();
