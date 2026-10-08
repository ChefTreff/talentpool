-- 0269 · Hinweismail an Teammitglieder mit bestehendem Konto (ADM-086)
-- Angewendet von der Architektur-Session am 08.10.2026 als 20261008081953.
-- 00NN · Hinweismail an Teammitglieder mit bestehendem Konto: create_team_member queued „Du bist jetzt im Team" (ADM-086)
--
-- Anlass: Konrad 06.10. (Paulinas Einladung) und 08.10.: „Teammitglied einladen" setzt bei einer
-- Person mit bestehendem Konto (z. B. Speaker aus einem früheren Test) nur die Rollen — die
-- Person erfährt nichts, weil Supabase für vorhandene Konten keine Einladung schickt. Konrad lädt
-- am 08.10. weitere Teammitglieder ein.
--
-- Umsetzung:
--   * Vorlage `team_member_added` (DE/EN): „Du bist jetzt im Team — hier anmelden", Portal-Link
--     (`{{portal_url}}/login`, kein Magic Link, kein Supabase-Invite), die **neu vergebenen**
--     Rollen in Worten (`{{roles_de}}` / `{{roles_en}}` aus dem Vokabular `role`).
--   * `create_team_member` (Live-Fassung aus dem Snapshot) queued die Mail über `queue_mail`,
--     wenn die Person ein Login hat **und** Rollen neu dazukamen. Ein zweiter Aufruf ohne neue
--     Rolle schickt nichts. Rückgabe zusätzlich `mail`: `queued` | `suppressed` (gesperrte
--     Adresse, im Protokoll ohne Klartext) | `none`.
--   * Audit `access.team_member` ohne Klartext-Adresse (nur Rollen, Edition, `new`, `mail`) —
--     vorher stand die Adresse im Payload (Plan-Hinweis zu #297).
-- Sprache wählt `queue_mail` (Person, sonst Deutsch). Die Adresse kommt aus der Datenbank, nie aus
-- dem Formular. Fehlerschlüssel unverändert.
set search_path = public, extensions;

insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active from (values
  ('team_member_added', 'de', 1, 'Du bist jetzt im ChefTreff-Team – hier anmelden',
   E'Hallo {{first_name}},\n\ndu bist jetzt im ChefTreff-Team für den Future Leader Summit. Im Portal sind dir diese Rollen zugewiesen: **{{roles_de}}**.\n\nDu hast schon ein Konto, ein neues brauchst du nicht. Melde dich mit dieser E-Mail-Adresse an – ohne Passwort: [Zum Portal]({{portal_url}}/login)\n\nNach der Anmeldung siehst du die Bereiche, für die du freigeschaltet bist. Fehlt etwas, sag Konrad Bescheid.\n\nViele Grüße\nChefTreff',
   'Teammitglied mit bestehendem Konto bekommt Rollen (ADM-086)', true),
  ('team_member_added', 'en', 1, 'You are now on the ChefTreff team – sign in here',
   E'Hi {{first_name}},\n\nyou are now on the ChefTreff team for the Future Leader Summit. These roles have been assigned to you in the portal: **{{roles_en}}**.\n\nYou already have an account, you do not need a new one. Sign in with this email address – no password needed: [Open the portal]({{portal_url}}/login)\n\nAfter signing in you see the areas you have been given access to. If something is missing, let Konrad know.\n\nBest,\nChefTreff',
   'Team member with an existing account is given roles (ADM-086)', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

create or replace function create_team_member(p_first_name text, p_last_name text, p_email text, p_roles text[], p_edition_id uuid)
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
  v_login boolean; v_mail text := 'none'; v_mail_id bigint; v_de text; v_en text;
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

  v_login := exists (select 1 from person p where p.id = v_pid and p.auth_user_id is not null);

  -- ADM-086: Wer schon ein Konto hat, bekommt keine Einladung von Supabase und erfuhr bisher
  -- nichts von den neuen Rollen. Eine Hinweismail über die Warteschlange sagt es ihm — nur wenn
  -- wirklich Rollen dazukamen (ein zweiter Klick ohne Neues schickt nichts) und nur an die
  -- Adresse aus der Datenbank. Kein Anmelde-Link in der Mail: er führt zur Anmeldeseite.
  if v_login and cardinality(v_vergeben) > 0 then
    select string_agg(coalesce(t.label_de, r.k), ', ' order by r.n), string_agg(coalesce(t.label_en, r.k), ', ' order by r.n)
      into v_de, v_en
      from unnest(v_vergeben) with ordinality as r(k, n)
      left join vocab_term t on t.vocabulary = 'role' and t.key = r.k;
    v_mail_id := queue_mail('team_member_added', v_pid, jsonb_build_object('roles_de', v_de, 'roles_en', v_en), 'person', null);
    if v_mail_id is not null then
      select ml.status into v_mail from mail_log ml where ml.id = v_mail_id;
    end if;
  end if;

  -- Audit ohne Klartext-Adresse: die Person steht an der Person, das Protokoll überlebt sie.
  perform log_audit('access.team_member', 'person', v_pid::text, null,
                    jsonb_build_object('roles', to_jsonb(v_vergeben), 'edition_id', p_edition_id, 'new', v_neu, 'mail', v_mail));
  return jsonb_build_object('person_id', v_pid, 'email', v_email, 'created', v_neu, 'roles', to_jsonb(v_vergeben),
                            'has_login', v_login, 'mail', v_mail);
end $$;

select harden_definer_functions();
