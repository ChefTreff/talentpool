-- Test „Abgabe über das Portal“ (HACK-011, vorschlag/v6_hack_abgabe.sql). Belegt:
--   01 Bucket hack-submissions privat, 50 MB; Tabelle ohne Grants; keine Schreib-Policy;
--   02 set_hack_challenge_deadline: ohne Rolle 42501, Hack-Team setzt, Audit;
--   03 register_hack_submission_file: fremde Person 42501, Mitglied darf, falscher Pfad 22023,
--      fehlendes Objekt P0002; vor der Frist late = false;
--   04 Lese-Policy (als authenticated): Mitglied sieht die Datei, fremdes Team nichts, Jury der
--      Challenge (Partner der Org) sieht sie, Waise nur das Hack-Team;
--   05 nach der Frist: Datei und Abgabe late = true, my_hack meldet late und Frist;
--   06 höchstens 10 Dateien (22023 too_many_files);
--   07 remove_hack_submission_file: fremde Person 42501, Mitglied entfernt, liefert den Pfad;
--   08 hack_submission_files / hack_judging / hack_admin_overview liefern late; anon ohne EXECUTE.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_a_pid uuid; v_a_uid uuid; v_b_pid uuid; v_b_uid uuid; v_c_pid uuid; v_c_uid uuid;
  v_jury_pid uuid; v_jury_uid uuid; v_staff_pid uuid; v_staff_uid uuid;
  v_ed uuid; v_org uuid; v_ch uuid; v_t uuid; v_t2 uuid; v_f uuid; v_p1 text; v_p2 text; v_pw text;
  v_s text; v_n integer; v_n1 integer; v_nw integer; v_j jsonb; r record; i integer;
begin
  select p.id, p.auth_user_id into v_a_pid, v_a_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 0 limit 1;
  select p.id, p.auth_user_id into v_b_pid, v_b_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 1 limit 1;
  select p.id, p.auth_user_id into v_c_pid, v_c_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 2 limit 1;
  select p.id, p.auth_user_id into v_jury_pid, v_jury_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 3 limit 1;
  select p.id, p.auth_user_id into v_staff_pid, v_staff_uid from person p where p.auth_user_id is not null and p.deleted_at is null order by p.created_at offset 4 limit 1;
  v_ed := hack_edition(null);
  delete from role_assignment where person_id in (v_a_pid, v_b_pid, v_c_pid, v_jury_pid, v_staff_pid);
  delete from hack_team_member where person_id in (v_a_pid, v_b_pid, v_c_pid, v_jury_pid, v_staff_pid);

  -- 01
  select case when b.public = false and b.file_size_limit = 52428800 then 'ok' else 'bucket' end into v_s
    from storage.buckets b where b.id = 'hack-submissions';
  insert into t_res values ('01_bucket_grants',
    case when v_s = 'ok'
          and not has_table_privilege('authenticated', 'hack_submission_file', 'select')
          and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                           and cmd <> 'SELECT' and coalesce(qual, '') || coalesce(with_check, '') like '%hack-submissions%')
         then 'ok' else coalesce(v_s, 'kein bucket') end);

  -- Aufbau (Serverkontext): Challenge einer Organisation mit Jury, Team A (a, b, c), Team B (jury-fremd)
  insert into organization (legal_name, communication_name, type) values ('Abgabe GmbH', 'Abgabe', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited');
  insert into org_membership (org_id, person_id, roles) values (v_org, v_jury_pid, '{primary_ops}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_jury_pid, 'partner_contact', 'org', v_org);
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_jury_pid, 'hackathon_partner', 'org', v_org);
  insert into hack_challenge (edition_id, org_id, title_en, mentors, criteria, status) values (v_ed, v_org, 'Abgabe-Test', '[]', '[]', 'published') returning id into v_ch;
  insert into hack_team (edition_id, name, join_code, challenge_id) values (v_ed, 'ZZ Abgabe', 'ZZABG1', v_ch) returning id into v_t;
  insert into hack_team (edition_id, name, join_code) values (v_ed, 'ZZ Fremd', 'ZZABG2') returning id into v_t2;
  insert into hack_team_member (team_id, person_id, edition_id) values (v_t, v_a_pid, v_ed), (v_t, v_b_pid, v_ed), (v_t2, v_c_pid, v_ed);
  insert into hack_team_member (team_id, person_id, edition_id)
    select v_t, p.id, v_ed from person p where p.id not in (v_a_pid, v_b_pid, v_c_pid, v_jury_pid, v_staff_pid)
       and p.deleted_at is null and not exists (select 1 from hack_team_member m where m.person_id = p.id and m.edition_id = v_ed)
     order by p.created_at limit 1;   -- drittes Mitglied für submit_hack
  v_p1 := v_t::text || '/zztest-pitch.pdf';
  v_p2 := v_t::text || '/zztest-demo.mp4';
  v_pw := v_t::text || '/zztest-waise.pdf';
  insert into storage.objects (bucket_id, name) values ('hack-submissions', v_p1), ('hack-submissions', v_p2), ('hack-submissions', v_pw);

  -- 02
  perform set_config('request.jwt.claims', json_build_object('sub', v_a_uid, 'role', 'authenticated')::text, true);
  begin perform set_hack_challenge_deadline(v_ch, now() + interval '1 day'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  insert into role_assignment (person_id, role, scope_type) values (v_staff_pid, 'hackathon_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  perform set_hack_challenge_deadline(v_ch, now() + interval '1 day');
  insert into t_res values ('02_frist',
    case when v_s = 'ok' and (select submission_deadline > now() from hack_challenge where id = v_ch)
          and exists (select 1 from audit_log a where a.action = 'hack.challenge_deadline' and a.object_id = v_ch::text)
         then 'ok' else v_s end);

  -- 03
  perform set_config('request.jwt.claims', json_build_object('sub', v_c_uid, 'role', 'authenticated')::text, true);
  begin perform register_hack_submission_file(v_t, v_p1, 'pitch.pdf'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a_uid, 'role', 'authenticated')::text, true);
  begin perform register_hack_submission_file(v_t, v_t2::text || '/x.pdf', 'x.pdf'); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '22023' then '/ok' else '/' || sqlstate end; end;
  begin perform register_hack_submission_file(v_t, v_t::text || '/fehlt.pdf', 'fehlt.pdf'); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = 'P0002' then '/ok' else '/' || sqlstate end; end;
  v_f := register_hack_submission_file(v_t, v_p1, 'pitch.pdf', 'application/pdf', 1000);
  insert into t_res values ('03_eintragen',
    case when v_s = 'ok/ok/ok' and (select not late from hack_submission_file where id = v_f) then 'ok' else v_s end);

  -- 04 Policy
  perform set_config('request.jwt.claims', json_build_object('sub', v_b_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) filter (where name = v_p1), count(*) filter (where name = v_pw) into v_n1, v_nw
    from storage.objects where bucket_id = 'hack-submissions' and name in (v_p1, v_pw);
  execute 'reset role';
  v_s := format('mitglied=%s/%s', v_n1, v_nw);
  perform set_config('request.jwt.claims', json_build_object('sub', v_c_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id = 'hack-submissions' and name in (v_p1, v_pw);
  execute 'reset role';
  v_s := v_s || format(' fremd=%s', v_n);
  perform set_config('request.jwt.claims', json_build_object('sub', v_jury_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) filter (where name = v_p1), count(*) filter (where name = v_pw) into v_n1, v_nw
    from storage.objects where bucket_id = 'hack-submissions' and name in (v_p1, v_pw);
  execute 'reset role';
  v_s := v_s || format(' jury=%s/%s', v_n1, v_nw);
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id = 'hack-submissions' and name = v_pw;
  execute 'reset role';
  v_s := v_s || format(' hackteam_waise=%s', v_n);
  insert into t_res values ('04_policy', case when v_s = 'mitglied=1/0 fremd=0 jury=1/0 hackteam_waise=1' then 'ok' else v_s end);

  -- 05 nach der Frist
  perform set_hack_challenge_deadline(v_ch, now() - interval '1 minute');
  perform set_config('request.jwt.claims', json_build_object('sub', v_a_uid, 'role', 'authenticated')::text, true);
  v_f := register_hack_submission_file(v_t, v_p2, 'demo.mp4', 'video/mp4', 2000);
  perform submit_hack('{"url":"https://example.org/demo"}'::jsonb);
  v_j := my_hack();
  insert into t_res values ('05_verspaetet',
    case when (select late from hack_submission_file where id = v_f)
          and (select late from hack_submission where team_id = v_t)
          and (v_j->'submission'->>'late')::boolean
          and v_j->'challenge'->>'submission_deadline' is not null
         then 'ok' else coalesce(v_j::text, 'leer') end);

  -- 06 Grenze 10
  perform set_config('request.jwt.claims', null, true);
  for i in 3..10 loop
    insert into storage.objects (bucket_id, name) values ('hack-submissions', v_t::text || '/zztest-' || i || '.pdf');
    insert into hack_submission_file (team_id, storage_path, filename) values (v_t, v_t::text || '/zztest-' || i || '.pdf', i || '.pdf');
  end loop;
  insert into storage.objects (bucket_id, name) values ('hack-submissions', v_t::text || '/zztest-11.pdf');
  perform set_config('request.jwt.claims', json_build_object('sub', v_a_uid, 'role', 'authenticated')::text, true);
  begin perform register_hack_submission_file(v_t, v_t::text || '/zztest-11.pdf', '11.pdf'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '22023' and sqlerrm = 'too_many_files' then 'ok' else sqlstate || ' ' || sqlerrm end; end;
  insert into t_res values ('06_grenze', case when v_s = 'ok' and (select count(*) from hack_submission_file where team_id = v_t) = 10 then 'ok' else v_s end);

  -- 07 entfernen
  perform set_config('request.jwt.claims', json_build_object('sub', v_c_uid, 'role', 'authenticated')::text, true);
  begin perform remove_hack_submission_file(v_f); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b_uid, 'role', 'authenticated')::text, true);
  insert into t_res values ('07_entfernen',
    case when v_s = 'ok' and remove_hack_submission_file(v_f) = v_p2 and not exists (select 1 from hack_submission_file where id = v_f)
         then 'ok' else v_s end);

  -- 08 Listen
  perform set_config('request.jwt.claims', json_build_object('sub', v_jury_uid, 'role', 'authenticated')::text, true);
  select count(*) into v_n from hack_submission_files() f where f.team_id = v_t;
  select * into r from hack_judging() j where j.team_id = v_t;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_uid, 'role', 'authenticated')::text, true);
  insert into t_res values ('08_listen_grants',
    case when v_n = 9 and r.late
          and (select o.late from hack_admin_overview() o where o.team_id = v_t)
          and (select c.submission_deadline is not null from hack_challenges() c where c.id = v_ch)
          and not has_function_privilege('anon', 'register_hack_submission_file(uuid,text,text,text,bigint)', 'execute')
          and not has_function_privilege('anon', 'hack_submission_files(uuid,uuid)', 'execute')
          and not has_function_privilege('anon', 'hack_submission_path_allowed(text)', 'execute')
          and not has_function_privilege('anon', 'set_hack_challenge_deadline(uuid,timestamptz)', 'execute')
         then 'ok' else format('n=%s late=%s', v_n, r.late) end);
end $$;
select * from t_res order by step;
rollback;
