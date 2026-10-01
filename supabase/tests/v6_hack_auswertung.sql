-- Test „Auswertungsart je Challenge“ (HACK-009, vorschlag/v6_hack_auswertung.sql). Belegt:
--   01 Standard jury; Prüfsatz: metric ohne Bezeichnung abgewiesen; Formular hat die drei
--      Felder hinter track;
--   02 Freigabe übernimmt Metric/Bezeichnung/Richtung aus dem Formular; Metric ohne
--      Bezeichnung ⇒ „Score“;
--   03 set_hack_challenge_judging: ohne Rolle 42501, metric ohne Bezeichnung 22023, Audit;
--   04 set_hack_metric: fremde Person 42501; Mitglied des Teams darf; Jury-Challenge 22023
--      not_metric_challenge; NaN 22023;
--   05 Leaderboard: unbestätigt sieht nur das eigene Team (und Hack-Team), Dritte nichts;
--   06 confirm_hack_metric: nur Hack-Team; danach Rang 1/2 nach Richtung (niedriger besser);
--   07 neuer Wert verliert die Bestätigung; gleicher Wert behält sie;
--   08 hack_judging liefert Modus und Wert; Tabelle ohne Grants; anon ohne EXECUTE.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_team_pid uuid; v_team_uid uuid; v_other_pid uuid; v_other_uid uuid; v_staff_pid uuid; v_staff_uid uuid;
  v_ed uuid; v_org uuid; v_oe uuid; v_tpl uuid; v_d uuid; v_c uuid; v_cj uuid; v_t1 uuid; v_t2 uuid; v_tj uuid;
  v_s text; v_n integer; v_schema jsonb; r record;
begin
  select p.id, p.auth_user_id into v_team_pid, v_team_uid from person p
   where p.auth_user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_other_pid, v_other_uid from person p
   where p.auth_user_id is not null and p.deleted_at is null and p.id <> v_team_pid order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_staff_pid, v_staff_uid from person p
   where p.auth_user_id is not null and p.deleted_at is null and p.id not in (v_team_pid, v_other_pid) order by p.created_at limit 1;
  v_ed := hack_edition(null);
  delete from role_assignment where person_id in (v_team_pid, v_other_pid, v_staff_pid);
  delete from hack_team_member where person_id in (v_team_pid, v_other_pid, v_staff_pid);

  -- 01
  select tp.id, tp.answers_schema into v_tpl, v_schema from deliverable_template tp where tp.key = 'hackathon_challenge';
  select string_agg(e.f->>'key', ',' order by e.ord) into v_s from jsonb_array_elements(v_schema) with ordinality e(f, ord);
  begin
    insert into hack_challenge (edition_id, title_en, mentors, criteria, judging_mode) values (v_ed, 'X', '[]', '[]', 'metric');
    v_s := v_s || '/ALLOWED (BUG)';
  exception when check_violation then v_s := v_s || '/ok'; end;
  insert into t_res values ('01_spalten_formular',
    case when v_s like '%,track,judging_mode,metric_label,metric_direction,%/ok' then 'ok' else v_s end);

  -- 02 Freigabe aus dem Formular (Hack-Team)
  insert into organization (legal_name, communication_name, type) values ('Metrik GmbH', 'Metrik', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited') returning id into v_oe;
  insert into deliverable (org_edition_id, template_id, key, status, answers, submitted_at)
    values (v_oe, v_tpl, 'hackathon_challenge', 'submitted',
            '{"title_en":"Metrik-Test","track":"data_science","judging_mode":"Metric (leaderboard)","metric_label":"MAE","metric_direction":"Lower is better"}'::jsonb, now())
    returning id into v_d;
  insert into role_assignment (person_id, role, scope_type) values (v_staff_pid, 'hackathon_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  v_c := publish_hack_challenge(v_d);
  update deliverable set answers = answers || '{"metric_label":""}'::jsonb where id = v_d;
  perform publish_hack_challenge(v_d);
  select * into r from hack_challenge where id = v_c;
  insert into t_res values ('02_freigabe',
    case when r.judging_mode = 'metric' and r.metric_label = 'Score' and r.metric_higher_better = false then 'ok'
         else r.judging_mode || '/' || coalesce(r.metric_label, '-') end);
  perform set_hack_challenge_judging(v_c, 'metric', 'MAE', false);

  -- 03
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_uid, 'role', 'authenticated')::text, true);
  begin perform set_hack_challenge_judging(v_c, 'jury'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  begin perform set_hack_challenge_judging(v_c, 'metric', '  '); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '22023' and sqlerrm = 'metric_label_missing' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('03_judging_setzen',
    case when v_s = 'ok/ok' and exists (select 1 from audit_log a where a.action = 'hack.challenge_judging' and a.object_id = v_c::text)
         then 'ok' else v_s end);

  -- Teams (Serverkontext): t1 mit v_team_pid, t2 ohne die Prüfpersonen, tj an einer Jury-Challenge
  perform set_config('request.jwt.claims', null, true);
  insert into hack_challenge (edition_id, title_en, mentors, criteria, status) values (v_ed, 'Jury-Test', '[]', '[]', 'published') returning id into v_cj;
  insert into hack_team (edition_id, name, join_code, challenge_id) values (v_ed, 'ZZ Metrik Eins', 'ZZMET1', v_c) returning id into v_t1;
  insert into hack_team (edition_id, name, join_code, challenge_id) values (v_ed, 'ZZ Metrik Zwei', 'ZZMET2', v_c) returning id into v_t2;
  insert into hack_team (edition_id, name, join_code, challenge_id) values (v_ed, 'ZZ Jury', 'ZZJUR1', v_cj) returning id into v_tj;
  insert into hack_team_member (team_id, person_id, edition_id) values (v_t1, v_team_pid, v_ed);

  -- 04
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_uid, 'role', 'authenticated')::text, true);
  begin perform set_hack_metric(v_t1, 0.5); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_team_uid, 'role', 'authenticated')::text, true);
  perform set_hack_metric(v_t1, 0.42, 'erste Abgabe');
  begin perform set_hack_metric(v_t1, 'NaN'::numeric); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '22023' then '/ok' else '/' || sqlstate end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  begin perform set_hack_metric(v_tj, 1); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '22023' and sqlerrm = 'not_metric_challenge' then '/ok' else '/' || sqlstate end; end;
  perform set_hack_metric(v_t2, 0.30);
  insert into t_res values ('04_wert_setzen',
    case when v_s = 'ok/ok/ok' and (select value from hack_metric_result where team_id = v_t1) = 0.42 then 'ok' else v_s end);

  -- 05 unbestätigt
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_uid, 'role', 'authenticated')::text, true);
  select count(*) into v_n from hack_leaderboard(v_c);
  v_s := 'dritte=' || v_n;
  perform set_config('request.jwt.claims', json_build_object('sub', v_team_uid, 'role', 'authenticated')::text, true);
  select string_agg(l.team_name || ':' || l.is_mine, ',') into v_s from hack_leaderboard(v_c) l;
  insert into t_res values ('05_unbestaetigt', case when v_n = 0 and v_s = 'ZZ Metrik Eins:true' then 'ok' else 'dritte=' || v_n || ' team=' || coalesce(v_s, '-') end);

  -- 06 bestätigen
  begin perform confirm_hack_metric(v_t1); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  perform confirm_hack_metric(v_t1);
  perform confirm_hack_metric(v_t2);
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_uid, 'role', 'authenticated')::text, true);
  select string_agg(l.rank || ':' || l.team_name, ',' order by l.rank) into v_s from hack_leaderboard(v_c) l;
  insert into t_res values ('06_rang', case when v_s = '1:ZZ Metrik Zwei,2:ZZ Metrik Eins' then 'ok' else coalesce(v_s, 'leer') end);

  -- 07 Änderung
  perform set_config('request.jwt.claims', json_build_object('sub', v_team_uid, 'role', 'authenticated')::text, true);
  perform set_hack_metric(v_t1, 0.42, 'gleich');
  v_s := case when (select confirmed_at is not null from hack_metric_result where team_id = v_t1) then 'ok' else 'verloren' end;
  perform set_hack_metric(v_t1, 0.20);
  insert into t_res values ('07_neu_bestaetigen',
    case when v_s = 'ok' and (select confirmed_at is null from hack_metric_result where team_id = v_t1) then 'ok' else v_s end);

  -- 08
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  select * into r from hack_judging() j where j.team_id = v_t1;
  insert into t_res values ('08_jury_grants',
    case when r.judging_mode = 'metric' and r.metric_label = 'MAE' and r.metric_value = 0.20 and not r.metric_confirmed
          and not has_table_privilege('authenticated', 'hack_metric_result', 'select')
          and not has_table_privilege('anon', 'hack_metric_result', 'select')
          and not has_function_privilege('anon', 'set_hack_metric(uuid,numeric,text)', 'execute')
          and not has_function_privilege('anon', 'confirm_hack_metric(uuid,boolean)', 'execute')
          and not has_function_privilege('anon', 'hack_leaderboard(uuid)', 'execute')
          and not has_function_privilege('anon', 'set_hack_challenge_judging(uuid,text,text,boolean)', 'execute')
         then 'ok' else coalesce(r::text, 'leer') end);
end $$;
select * from t_res order by step;
rollback;
