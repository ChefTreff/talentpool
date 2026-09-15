-- Smoke-Test 0106 (Team als Liste). Belegt:
--   01 ohne Admin-Rolle bleibt die Teamliste zu ⇒ 42501 — sie nennt Namen und
--      Mailadressen des Teams;
--   02 wer eine Teamrolle hat, steht drin, mit aufgelöstem Scope statt UUID;
--   03 wer nur eine Teilnehmerrolle hat, steht **nicht** drin — sonst stünde
--      der halbe Talentpool in der Teamliste;
--   04 eine abgelaufene Rolle macht niemanden zum Team;
--   05 mehrere Rollen einer Person kommen als eine Zeile;
--   06 `has_account` zeigt, wer sich überhaupt einloggen kann — eine Rolle
--      ohne Konto ist die häufigste stille Panne;
--   07 die Zahl der globalen Admins steht in jeder Zeile;
--   08 `team_role_keys` enthält keine Teilnehmerrollen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid;
  v_lead uuid; v_gast uuid; v_alt uuid; v_row record; v_n integer; v_txt text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  delete from staff_user where auth_user_id = v_uid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 01 · Ohne Admin-Rolle. Die Liste nennt Namen und Mailadressen.
  begin
    perform team_members();
    insert into t_res values ('01_ohne_recht', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('01_ohne_recht', 'abgewiesen ' || sqlstate); end;

  insert into person (first_name, last_name, preferred_language, source_first, tier)
    values ('Tea', 'Mitglied', 'de', 'test', 'lead') returning id into v_lead;
  insert into role_assignment (person_id, role, scope_type, edition_id)
    values (v_lead, 'speaker_manager', 'edition', v_ed);
  insert into role_assignment (person_id, role, scope_type)
    values (v_lead, 'production_team', 'global');
  insert into person (first_name, last_name, preferred_language, source_first, tier)
    values ('Gast', 'Teilnehmer', 'de', 'test', 'lead') returning id into v_gast;
  insert into role_assignment (person_id, role, scope_type) values (v_gast, 'talent', 'global');
  insert into person (first_name, last_name, preferred_language, source_first, tier)
    values ('Alt', 'Lead', 'de', 'test', 'lead') returning id into v_alt;
  insert into role_assignment (person_id, role, scope_type, valid_from, valid_to)
    values (v_alt, 'area_lead_partner', 'global', now() - interval '2 days', now() - interval '1 day');

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');

  -- 02/05 · Die Zeile der Teamperson.
  select * into v_row from team_members() m where m.person_id = v_lead;
  insert into t_res values ('02_scope',
    case when v_row.roles @> '[{"scope_type": "edition"}]'::jsonb
          and (select count(*) from jsonb_array_elements(v_row.roles) r
                where r->>'role' = 'speaker_manager' and r->>'scope_label' is not null) = 1
         then 'Scope als Name (richtig)'
         else 'unerwartet ' || coalesce(v_row.roles::text, 'null') end);
  insert into t_res values ('05_eine_zeile',
    case when jsonb_array_length(v_row.roles) = 2 then 'zwei Rollen, eine Zeile (richtig)'
         else 'unerwartet ' || jsonb_array_length(coalesce(v_row.roles, '[]'::jsonb)) end);

  -- 03 · Teilnehmerrolle zählt nicht.
  select count(*)::integer into v_n from team_members() m where m.person_id = v_gast;
  insert into t_res values ('03_teilnehmer',
    case when v_n = 0 then 'nicht im Team (richtig)' else 'im Team (BUG)' end);

  -- 04 · Abgelaufene Rolle.
  select count(*)::integer into v_n from team_members() m where m.person_id = v_alt;
  insert into t_res values ('04_abgelaufen',
    case when v_n = 0 then 'nicht mehr im Team (richtig)' else 'noch gelistet (BUG)' end);

  -- 06 · Portalzugang.
  select m.has_account into v_txt from team_members() m where m.person_id = v_lead;
  insert into t_res values ('06_kein_konto',
    case when v_txt = 'false' then 'Rolle ohne Konto sichtbar (richtig)' else 'unerwartet ' || coalesce(v_txt, 'null') end);

  -- 07 · Zahl der Admins.
  select m.admins, m.is_admin into v_n, v_txt from team_members() m where m.person_id = v_pid;
  insert into t_res values ('07_admins',
    case when v_n = 1 and v_txt = 'true' then 'ein Admin, als solcher erkannt (richtig)'
         else 'unerwartet ' || v_n || '/' || coalesce(v_txt, 'null') end);

  -- 08 · Die Liste der Teamrollen.
  insert into t_res values ('08_rollenliste',
    case when not (team_role_keys() && array['talent', 'speaker', 'partner_contact', 'volunteer',
                                             'hackathon_participant', 'speaker_assistant', 'standbuehne_editor'])
          and team_role_keys() && array['admin']
         then 'keine Teilnehmerrollen (richtig)'
         else 'unerwartet ' || array_to_string(team_role_keys(), ',') end);
end $$;
select * from t_res order by step;
rollback;
