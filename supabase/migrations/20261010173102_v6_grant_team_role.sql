-- 0314 · Teamrolle vergeben mit Hinweismail auf allen drei Wegen (ADM-086, K-88)
-- Angewendet von der Architektur-Session am 10.10.2026 als 20261010173102.
--
-- Anlass: ADM-086 (0269) schickt die Hinweismail „Du bist jetzt im Team“ nur auf einem von drei Wegen — „Neu einladen“ (`create_team_member`). „+ Rolle“ in der
-- Liste von Team & Zugänge und „Aus dem Talentpool“ riefen `assign_role` direkt auf; wer schon ein Konto hat, erfuhr dort nichts. Befund Admin-Chat bei der K-88-Nachprüfung
-- (10.10.2026); Plan: ja, auf allen drei Wegen, eine Regel.
--
-- Eine Funktion für die beiden Wege, kein Umbau von `assign_role` (das auch Stage Leads, Speaker-Leads und die Rollenverwaltung nutzen) und keine Änderung an
-- `create_team_member`:
--
--   grant_team_role(p_person_id uuid, p_role text, p_edition_id uuid default null) → jsonb
--     * Recht: Abschnitt `access` (`has_admin_section('access')`, sonst 42501); `assign_role` prüft zusätzlich `has_role('admin')`, wie bisher.
--     * Rolle: nur eine **Teamrolle** (`team_role_keys()`, mit `admin`), sonst invalid_role (22023). Die App bietet nur diese an; der Weg über die Tabelle ist damit enger als
--       der direkte `assign_role`-Aufruf der alten Aktion.
--     * Geltung: `admin` ist immer global (ein Admin nur für eine Edition wäre im nächsten Jahr lautlos keiner mehr); jede andere Rolle gilt für die Edition, wenn eine
--       gegeben ist (sonst edition_not_found, P0002), sonst global — wie vorher `grantTeamRole`.
--     * Gesperrte Person: access_blocked (P0001) — wie bei `create_team_member`; ein gesperrter Zugang hat keine Rollen, eine neue würde ihn unterlaufen.
--     * „Rolle neu“: es gab keine **gültige** Zuweisung derselben Rolle im selben Geltungsbereich (`valid_to` leer oder in der Zukunft). Eine abgelaufene gilt als neu.
--     * Hinweismail: nur wenn die Person ein Konto hat **und** die Rolle neu ist — dieselbe Regel und dieselbe Vorlage `team_member_added` wie in `create_team_member`, Rollen
--       in Worten aus dem Vokabular `role`, Adresse nur aus der Datenbank (`queue_mail`). Ohne Konto gibt es keine Mail (die Person bekommt beim ersten Login ohnehin den
--       Zugang; wer sie einlädt, nutzt „Einladen“); schon vorhandene Rolle: keine Mail, auch kein zweiter Eintrag in der Warteschlange.
--     * Audit: `role.assign` (aus `assign_role`) und `access.team_role` mit Rolle, Geltung und Mailstatus — ohne Klartext-Adresse (die Person steht an der Person).
--     * Rückgabe: {person_id, role, granted (Rolle war neu), has_login, mail: 'queued' | 'suppressed' | 'none'}.
--
-- Fehlerschlüssel: keine neuen (access_blocked, edition_not_found, invalid_role, person_not_found stehen im Wörterbuch).
set search_path = public, extensions;

create or replace function grant_team_role(p_person_id uuid, p_role text, p_edition_id uuid default null)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_ed uuid := case when p_role = 'admin' then null else p_edition_id end;
  v_scope text; v_blocked timestamptz; v_login boolean; v_neu boolean;
  v_mail text := 'none'; v_mail_id bigint; v_de text; v_en text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('access') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_role is null or not (p_role = any (team_role_keys())) then
    raise exception 'invalid_role' using errcode = '22023', detail = coalesce(p_role, 'null');
  end if;
  select p.access_blocked_at, p.auth_user_id is not null into v_blocked, v_login
    from person p where p.id = p_person_id and p.deleted_at is null;
  if not found then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  if v_blocked is not null then raise exception 'access_blocked' using errcode = 'P0001'; end if;
  if v_ed is not null and not exists (select 1 from event e where e.id = v_ed and e.is_edition) then
    raise exception 'edition_not_found' using errcode = 'P0002';
  end if;
  v_scope := case when v_ed is null then 'global' else 'edition' end;

  v_neu := not exists (
    select 1 from role_assignment ra
     where ra.person_id = p_person_id and ra.role = p_role and ra.scope_type = v_scope
       and ra.scope_id is null and ra.edition_id is not distinct from v_ed and ra.portal is null
       and (ra.valid_to is null or ra.valid_to > now()));

  perform assign_role(p_person_id, p_role, v_scope, null, v_ed, null, null, null, 'Team (Admin)');

  if v_login and v_neu then
    select coalesce(t.label_de, p_role), coalesce(t.label_en, p_role) into v_de, v_en
      from (select 1) x left join vocab_term t on t.vocabulary = 'role' and t.key = p_role;
    v_mail_id := queue_mail('team_member_added', p_person_id, jsonb_build_object('roles_de', v_de, 'roles_en', v_en), 'person', null);
    if v_mail_id is not null then
      select ml.status into v_mail from mail_log ml where ml.id = v_mail_id;
    end if;
  end if;

  perform log_audit('access.team_role', 'person', p_person_id::text, null,
                    jsonb_build_object('role', p_role, 'scope_type', v_scope, 'edition_id', v_ed, 'new', v_neu, 'mail', v_mail));
  return jsonb_build_object('person_id', p_person_id, 'role', p_role, 'granted', v_neu, 'has_login', v_login, 'mail', v_mail);
end $$;

select harden_definer_functions();
