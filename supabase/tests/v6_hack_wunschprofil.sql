-- Test „Wunschprofil je Challenge“ (HACK-015, vorschlag/v6_hack_wunschprofil.sql). Belegt:
--   01 Spalten mit Prüfsatz (9 Studienfelder abgewiesen), vocab_binding für beide Listen;
--   02 set_hack_challenge_profile: fremde Person 42501; Partner mit Bearbeitungsrecht setzt
--      (Doppelte fallen weg), Audit;
--   03 unbekannter Begriff 22023 invalid_vocab_value (Studienfeld und Skill), Text > 500 22023;
--   04 Hack-Team darf jede Challenge; hack_challenge_profiles liefert Profil und can_edit
--      (Partner: true für die eigene, false für fremde; Teilnehmende: false);
--   05 anon ohne EXECUTE.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_par_pid uuid; v_par_uid uuid; v_oth_pid uuid; v_oth_uid uuid; v_staff_pid uuid; v_staff_uid uuid;
  v_ed uuid; v_org uuid; v_c uuid; v_c2 uuid; v_sf text; v_sk text; v_s text; r record;
begin
  select p.id, p.auth_user_id into v_par_pid, v_par_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 0 limit 1;
  select p.id, p.auth_user_id into v_oth_pid, v_oth_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 1 limit 1;
  select p.id, p.auth_user_id into v_staff_pid, v_staff_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 2 limit 1;
  delete from role_assignment where person_id in (v_par_pid, v_oth_pid, v_staff_pid);
  v_ed := hack_edition(null);
  select key into v_sf from vocab_term where vocabulary = 'study_field' and active order by sort_order limit 1;
  select key into v_sk from vocab_term where vocabulary = 'skill' and active order by sort_order limit 1;

  insert into organization (legal_name, communication_name, type) values ('Profil GmbH', 'Profil', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited');
  insert into org_membership (org_id, person_id, roles) values (v_org, v_par_pid, '{primary_ops}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_par_pid, 'partner_contact', 'org', v_org);
  insert into hack_challenge (edition_id, org_id, title_en, mentors, criteria, status) values (v_ed, v_org, 'Profil-Test', '[]', '[]', 'published') returning id into v_c;
  insert into hack_challenge (edition_id, title_en, mentors, criteria, status) values (v_ed, 'Fremd-Test', '[]', '[]', 'published') returning id into v_c2;

  -- 01
  begin
    update hack_challenge set target_study_fields = array['a','b','c','d','e','f','g','h','i'] where id = v_c2;
    v_s := 'ALLOWED (BUG)';
  exception when check_violation then v_s := 'ok'; end;
  insert into t_res values ('01_spalten', case when v_s = 'ok'
    and (select count(*) from vocab_binding where table_name = 'hack_challenge' and column_name in ('target_study_fields', 'target_skills')) = 2
    then 'ok' else v_s end);

  -- 02
  perform set_config('request.jwt.claims', json_build_object('sub', v_oth_uid, 'role', 'authenticated')::text, true);
  begin perform set_hack_challenge_profile(v_c, array[v_sf], array[v_sk], 'x'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_par_uid, 'role', 'authenticated')::text, true);
  perform set_hack_challenge_profile(v_c, array[v_sf, v_sf], array[v_sk], '  Leute, die gern mit Daten arbeiten  ');
  select * into r from hack_challenge where id = v_c;
  insert into t_res values ('02_partner_setzt',
    case when v_s = 'ok' and r.target_study_fields = array[v_sf] and r.target_skills = array[v_sk]
          and r.target_profile = 'Leute, die gern mit Daten arbeiten'
          and exists (select 1 from audit_log a where a.action = 'hack.challenge_profile' and a.object_id = v_c::text)
         then 'ok' else v_s || ' ' || r.target_study_fields::text end);

  -- 03
  v_s := '';
  begin perform set_hack_challenge_profile(v_c, array['gibtsnicht'], '{}', null); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '22023' and sqlerrm = 'invalid_vocab_value' then 'ok' else sqlstate end; end;
  begin perform set_hack_challenge_profile(v_c, '{}', array['gibtsnicht'], null); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '22023' then '/ok' else '/' || sqlstate end; end;
  begin perform set_hack_challenge_profile(v_c, '{}', '{}', repeat('x', 501)); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '22023' and sqlerrm = 'too_long' then '/ok' else '/' || sqlstate end; end;
  begin perform set_hack_challenge_profile(v_c2, '{}', '{}', 'fremd'); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '42501' then '/ok' else '/' || sqlstate end; end;
  insert into t_res values ('03_pruefungen', case when v_s = 'ok/ok/ok/ok' then 'ok' else v_s end);

  -- 04
  select string_agg(p.title || ':' || p.can_edit, ',' order by p.title) into v_s from hack_challenge_profiles() p where p.challenge_id in (v_c, v_c2);
  insert into role_assignment (person_id, role, scope_type) values (v_staff_pid, 'hackathon_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  perform set_hack_challenge_profile(v_c2, '{}', array[v_sk], 'vom Hack-Team');
  perform set_config('request.jwt.claims', json_build_object('sub', v_oth_uid, 'role', 'authenticated')::text, true);
  select * into r from hack_challenge_profiles() p where p.challenge_id = v_c;
  insert into t_res values ('04_lesen',
    case when v_s = 'Fremd-Test:false,Profil-Test:true' and r.profile = 'Leute, die gern mit Daten arbeiten' and not r.can_edit
          and (select target_profile from hack_challenge where id = v_c2) = 'vom Hack-Team'
         then 'ok' else v_s end);

  -- 05
  insert into t_res values ('05_anon',
    case when not has_function_privilege('anon', 'set_hack_challenge_profile(uuid,text[],text[],text)', 'execute')
          and not has_function_privilege('anon', 'hack_challenge_profiles(uuid,text)', 'execute')
         then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
