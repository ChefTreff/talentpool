-- 00NN · Team & Zugänge: eine Liste (ADM-094, Lesefunktion)
--
-- Anlass: Konrad 08.10.2026: „Team und Zugänge sind inhaltlich fast identisch, der Unterschied ist nicht erkennbar.“
-- Analyse und Funktionsmatrix: docs/analyse-team-zugaenge-2026-10-08.md (Plan hat die Lesefunktion am 08.10. freigegeben).
--
-- **Nur lesen, nichts Neues schreiben.** Die Funktion ist die Grundlage der späteren Seite „Team & Zugänge“; bis dahin
-- ruft sie niemand auf. Vergeben, Entziehen, Einladen, Sperren und Kiosk-Geräte bleiben bei ihren Funktionen
-- (`assign_role`, `revoke_role`, `set_person_access`, `create_kiosk_account`, …) und deren Rechteprüfung.
--
--   team_access_list(p_query, p_filter, p_limit, p_offset)
--
-- * Menge wie `access_accounts`: alle, die ein Konto **oder** eine aktive Rolle haben (gelöschte Personen nicht).
-- * `p_filter`: `alle` (Vorgabe) · `team` (mindestens eine aktive Team-Rolle, `team_role_keys()`) · `gesperrt` ·
--   `ohne_login` (Rolle, aber kein Konto). Alles andere ⇒ 22023 `invalid_filter`. Das ersetzt die zwei Seiten durch **einen**
--   Bestand, der anders gefiltert wird.
-- * `roles` (jsonb): **alle** aktiven Rollen der Person (auch Speaker, Partner, Kiosk) mit Id, Rolle, Geltungsbereich,
--   Anzeigename des Bereichs und Ablauf — genug, um am Badge zu entziehen. Kein Notizfeld (`note` bleibt in
--   `roles_of_person`, dort nur für `admin`).
-- * `since`: frühester Beginn einer aktiven **Team**-Rolle (null bei Personen ohne Team-Rolle) wie in `team_members()`;
--   `admins`: Zahl der aktiven globalen Admins (für den Hinweis „letzter Admin“ vor dem Entziehen).
-- * Suche in Name und Hauptadresse; `%`, `_` und `\` zählen als Zeichen (`board_like_pattern`).
-- * Gesperrte stehen zuerst (wie in Zugänge), dann nach Name.
-- * Rechte: Abschnitt `access` (`has_admin_section`). Die Seite ist damit für Personen mit Ausnahme (ADM-053) lesbar; Rollen
--   vergeben und entziehen prüft weiter `has_role('admin')` in der Datenbank — ein Lesender sieht, ändert aber nichts.
-- * Datenschutz: E-Mail ist die Hauptadresse (wie heute in Zugänge); keine Geburtsdaten, kein Telefon, keine Notizen.
--
-- **Bewusst nicht in dieser Migration:** der Abschnitt `team` bleibt, wie er ist. `/admin/team` liegt nicht unter dem Pfad
-- von `access`, und die Leiste verlangt je Eintrag einen Abschnitt, unter dessen Pfad er liegt (tests/admin-navigation) —
-- das Zusammenlegen der Abschnitte ist ein Umzug der Seite und damit Navigation; es kommt mit der Oberfläche nach
-- Konrads Go (Vorschlag dort: Migration der Ausnahmen `team` → `access`, `team_members()` entfällt).
-- Fehlerschlüssel: 42501 · 22023 `invalid_filter`.
set search_path = public, extensions;

create or replace function team_access_list(p_query text default null, p_filter text default 'alle', p_limit integer default 50, p_offset integer default 0)
 RETURNS TABLE(person_id uuid, name text, email text, has_login boolean, blocked_at timestamp with time zone, is_team boolean, is_admin boolean, roles jsonb, since timestamp with time zone, admins integer, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_filter text := coalesce(nullif(btrim(coalesce(p_filter, '')), ''), 'alle');
  v_admins integer;
begin
  if not has_admin_section('access') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_filter not in ('alle', 'team', 'gesperrt', 'ohne_login') then
    raise exception 'invalid_filter' using errcode = '22023', detail = v_filter;
  end if;

  select count(distinct ra.person_id)::integer into v_admins
    from role_assignment ra
   where ra.role = 'admin' and ra.scope_type = 'global'
     and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now());

  return query
  with rollen as (
    select ra.person_id as pid,
           jsonb_agg(jsonb_build_object(
             'id', ra.id, 'role', ra.role, 'scope_type', ra.scope_type,
             'scope_id', ra.scope_id, 'edition_id', ra.edition_id, 'portal', ra.portal,
             'valid_to', ra.valid_to,
             'scope_label', case ra.scope_type
               when 'edition'   then (select e.name from event e where e.id = ra.edition_id)
               when 'portal'    then ra.portal
               when 'org'       then (select coalesce(o.communication_name, o.legal_name) from organization o where o.id = ra.scope_id)
               when 'stage'     then (select s.name from stage s where s.id = ra.scope_id)
               when 'stage_day' then (select s.name || ' · ' || d.day_date::text
                                        from stage_day sd join stage s on s.id = sd.stage_id
                                        join event_day d on d.id = sd.event_day_id where sd.id = ra.scope_id)
               when 'slot'      then (select s.name || ' · ' || to_char(sl.start_at at time zone 'Europe/Berlin', 'DD.MM. HH24:MI')
                                        from slot sl join stage s on s.id = sl.stage_id where sl.id = ra.scope_id)
               else null end)
             order by ra.role, ra.created_at) as r,
           bool_or(ra.role = any (team_role_keys())) as team,
           bool_or(ra.role = 'admin') as adm,
           min(ra.valid_from) filter (where ra.role = any (team_role_keys())) as seit
      from role_assignment ra
     where ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
     group by ra.person_id
  ), kandidaten as (
    -- Konto **oder** Rolle: ein Konto ohne Rolle kommt ins Portal, eine Rolle ohne Konto wartet auf die Einladung.
    select p.id, p.auth_user_id, p.access_blocked_at,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as nm,
           (select pe.email::text from person_email pe where pe.person_id = p.id and pe.is_primary limit 1) as mail,
           coalesce(r.r, '[]'::jsonb) as rl, coalesce(r.team, false) as tm, coalesce(r.adm, false) as ad, r.seit
      from person p
      left join rollen r on r.pid = p.id
     where p.deleted_at is null
       and (p.auth_user_id is not null or r.pid is not null)
  )
  select k.id, k.nm, k.mail, k.auth_user_id is not null, k.access_blocked_at, k.tm, k.ad, k.rl, k.seit, v_admins,
         count(*) over ()
    from kandidaten k
   where (v_q is null or coalesce(k.nm, '') ilike board_like_pattern(v_q) or coalesce(k.mail, '') ilike board_like_pattern(v_q))
     and case v_filter
           when 'team' then k.tm
           when 'gesperrt' then k.access_blocked_at is not null
           when 'ohne_login' then k.auth_user_id is null
           else true end
   order by (k.access_blocked_at is not null) desc, k.nm nulls last, k.id
   limit v_limit offset v_offset;
end $$;

select harden_definer_functions();
