-- Test „Admin-Abschnitt Hackathon" (ADM-055, vorschlag/v6_admin_hackathon.sql; setzt
-- v6_hack_portfolio voraus). Belegt:
--   01 admin_section_role kennt hackathon für admin, area_lead_hackathon, hackathon_team;
--   02 ohne Rolle: is_hack_team() falsch, beide Listen 42501, set_hack_application_status 42501;
--   03 hackathon_team (bisher ausgesperrt): is_hack_team() wahr, Bewerbung erscheint mit
--      Portfolio-Link, Entscheidung über set_hack_application_status geht;
--   04 area_lead_hackathon weiter berechtigt;
--   05 Ausnahme aus der Verwaltung: hackathon_team per Override gesperrt ⇒ wieder 42501;
--   06 eingereichtes Challenge-Formular erscheint in hack_open_challenges, ein offenes nicht;
--   07 Spaltenliste der Bewerbungen ohne E-Mail; anon ohne EXECUTE.
--
-- Probelauf der Build-Session am 01.10.2026 (`db.sh dry-run` mit v6_hack_portfolio + dieser
-- Migration, alles zurueckgerollt): 7 von 7 Schritten gruen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_app_pid uuid; v_ed uuid; v_app uuid; v_org uuid; v_oe uuid; v_tpl uuid;
  v_d1 uuid; v_d2 uuid; v_s text; v_n integer; r record;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null and p.deleted_at is null limit 1;
  select p.id into v_app_pid from person p where p.id <> v_pid and p.deleted_at is null limit 1;
  v_ed := hack_edition(null);
  delete from role_assignment where person_id = v_pid;
  delete from admin_section_override where person_id = v_pid or role = 'hackathon_team';

  -- 01
  select string_agg(role, ',' order by role) into v_s from admin_section_role where section = 'hackathon';
  insert into t_res values ('01_abschnitt', case when v_s = 'admin,area_lead_hackathon,hackathon_team' then 'ok' else coalesce(v_s, 'leer') end);

  -- Bewerbung einer anderen Person (Serverkontext)
  delete from hack_application where person_id = v_app_pid and edition_id = v_ed;
  insert into hack_application (person_id, edition_id, skills, motivation, github_url)
    values (v_app_pid, v_ed, '{}', 'Admin-Test', 'https://github.com/admintest') returning id into v_app;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 02 ohne Rolle
  v_s := case when is_hack_team() then 'ALLOWED (BUG)' else 'ok' end;
  begin perform * from hack_applications_admin(); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  begin perform * from hack_open_challenges(); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  begin perform set_hack_application_status(v_app, 'accepted'); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('02_ohne_rolle', case when v_s = 'ok/ok/ok/ok' then 'ok' else v_s end);

  -- 03 hackathon_team
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'hackathon_team', 'global');
  select * into r from hack_applications_admin() a where a.application_id = v_app;
  perform set_hack_application_status(v_app, 'accepted');
  insert into t_res values ('03_hackathon_team',
    case when is_hack_team() and r.github_url = 'https://github.com/admintest' and r.motivation = 'Admin-Test'
          and (select status from hack_application where id = v_app) = 'accepted'
         then 'ok' else coalesce(r::text, 'leer') end);

  -- 05 Override sperrt (vor 04, Rolle steht noch)
  insert into admin_section_override (section, role, allowed) values ('hackathon', 'hackathon_team', false);
  begin perform * from hack_applications_admin(); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  insert into t_res values ('05_override_sperrt', v_s);
  delete from admin_section_override where role = 'hackathon_team' and section = 'hackathon';
  delete from role_assignment where person_id = v_pid;

  -- 04 area_lead_hackathon
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_hackathon', 'global');
  insert into t_res values ('04_area_lead', case when is_hack_team() then 'ok' else 'FEHLER' end);

  -- 06 offene Challenges
  perform set_config('request.jwt.claims', null, true);
  insert into organization (legal_name, communication_name, type) values ('Admin Hack GmbH', 'AdminHack', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  select id into v_tpl from deliverable_template where key = 'hackathon_challenge';
  insert into deliverable (org_edition_id, template_id, key, status, answers, submitted_at)
    values (v_oe, v_tpl, 'hackathon_challenge', 'submitted', '{"title_en":"Test Challenge"}'::jsonb, now()) returning id into v_d1;
  insert into organization (legal_name, communication_name, type) values ('Offen Hack GmbH', 'OffenHack', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into deliverable (org_edition_id, template_id, key, status, answers)
    values (v_oe, v_tpl, 'hackathon_challenge', 'open', '{"title_en":"Noch offen"}'::jsonb) returning id into v_d2;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  select string_agg(c.title, ',') into v_s from hack_open_challenges() c where c.deliverable_id in (v_d1, v_d2);
  insert into t_res values ('06_offene_challenges', case when v_s = 'Test Challenge' then 'ok' else coalesce(v_s, 'leer') end);

  -- 07
  insert into t_res values ('07_spalten_grants',
    case when pg_get_function_result('hack_applications_admin(uuid)'::regprocedure) !~* 'mail'
          and not has_function_privilege('anon', 'hack_applications_admin(uuid)', 'execute')
          and not has_function_privilege('anon', 'hack_open_challenges(uuid)', 'execute')
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
