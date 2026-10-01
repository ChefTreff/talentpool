-- Test „Datensatz je Challenge“ (HACK-012, vorschlag/v6_hack_datensatz.sql). Belegt:
--   01 Bucket hack-datasets privat, 50 MB; Tabelle ohne Grants; keine Schreib-Policy im Bucket;
--   02 register_hack_dataset: fremde Person 42501; Partner mit Bearbeitungsrecht darf;
--      falscher Pfad 22023 path_mismatch; Objekt fehlt P0002; zweite Datei wird aktuell, Audit;
--   03 Lesen über die Policy (set role authenticated): Teammitglied der Challenge sieht nur die
--      aktuelle Datei; Mitglied eines Teams einer anderen Challenge sieht nichts; ohne Team nichts;
--   04 hack_challenge_dataset: Teammitglied bekommt die aktuelle Datei, Fremde 42501;
--   05 Partner (Verwalter) sieht beide Versionen, Waise nur das Hack-Team;
--   06 zurückgezogenes Team verliert den Zugriff; anon ohne EXECUTE;
--   07 hack_dataset_targets: Partner sieht nur die eigene Challenge mit Datei, Teammitglied keine.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_mem_pid uuid; v_mem_uid uuid; v_par_pid uuid; v_par_uid uuid; v_oth_pid uuid; v_oth_uid uuid;
  v_ed uuid; v_org uuid; v_c uuid; v_c2 uuid; v_t uuid; v_t2 uuid;
  v_p1 text; v_p2 text; v_pw text; v_s text; v_n integer; v_n1 integer; v_n2 integer; v_nw integer; r record;
begin
  select p.id, p.auth_user_id into v_mem_pid, v_mem_uid from person p
   where p.auth_user_id is not null and p.deleted_at is null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_par_pid, v_par_uid from person p
   where p.auth_user_id is not null and p.deleted_at is null and p.id <> v_mem_pid order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_oth_pid, v_oth_uid from person p
   where p.auth_user_id is not null and p.deleted_at is null and p.id not in (v_mem_pid, v_par_pid) order by p.created_at limit 1;
  v_ed := hack_edition(null);
  delete from role_assignment where person_id in (v_mem_pid, v_par_pid, v_oth_pid);
  delete from hack_team_member where person_id in (v_mem_pid, v_par_pid, v_oth_pid);

  -- 01
  select case when b.public = false and b.file_size_limit = 52428800 then 'ok' else 'bucket' end into v_s
    from storage.buckets b where b.id = 'hack-datasets';
  insert into t_res values ('01_bucket_grants',
    case when v_s = 'ok'
          and not has_table_privilege('authenticated', 'hack_dataset', 'select')
          and not has_table_privilege('authenticated', 'hack_dataset', 'insert')
          and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                           and cmd <> 'SELECT' and coalesce(qual, '') || coalesce(with_check, '') like '%hack-datasets%')
         then 'ok' else coalesce(v_s, 'kein bucket') end);

  -- Organisation, Partner, Challenges, Teams (Serverkontext)
  insert into organization (legal_name, communication_name, type) values ('Daten GmbH', 'Daten', 'corporate') returning id into v_org;
  insert into org_edition (org_id, edition_id, onboarding_status) values (v_org, v_ed, 'invited');
  insert into org_membership (org_id, person_id, roles) values (v_org, v_par_pid, '{primary_ops}');
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_par_pid, 'partner_contact', 'org', v_org);
  insert into hack_challenge (edition_id, org_id, title_en, mentors, criteria, status) values (v_ed, v_org, 'Daten-Test', '[]', '[]', 'published') returning id into v_c;
  insert into hack_challenge (edition_id, title_en, mentors, criteria, status) values (v_ed, 'Andere', '[]', '[]', 'published') returning id into v_c2;
  insert into hack_team (edition_id, name, join_code, challenge_id) values (v_ed, 'ZZ Daten', 'ZZDAT1', v_c) returning id into v_t;
  insert into hack_team (edition_id, name, join_code, challenge_id) values (v_ed, 'ZZ Andere', 'ZZDAT2', v_c2) returning id into v_t2;
  insert into hack_team_member (team_id, person_id, edition_id) values (v_t, v_mem_pid, v_ed);
  insert into hack_team_member (team_id, person_id, edition_id) values (v_t2, v_oth_pid, v_ed);
  v_p1 := v_c::text || '/zztest-v1.csv';
  v_p2 := v_c::text || '/zztest-v2.csv';
  v_pw := v_c::text || '/zztest-waise.csv';
  insert into storage.objects (bucket_id, name) values ('hack-datasets', v_p1), ('hack-datasets', v_p2), ('hack-datasets', v_pw);

  -- 02
  perform set_config('request.jwt.claims', json_build_object('sub', v_oth_uid, 'role', 'authenticated')::text, true);
  begin perform register_hack_dataset(v_c, v_p1, 'v1.csv'); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_par_uid, 'role', 'authenticated')::text, true);
  begin perform register_hack_dataset(v_c, v_c2::text || '/x.csv', 'x.csv'); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = '22023' and sqlerrm = 'path_mismatch' then '/ok' else '/' || sqlstate end; end;
  begin perform register_hack_dataset(v_c, v_c::text || '/fehlt.csv', 'fehlt.csv'); v_s := v_s || '/ALLOWED (BUG)';
  exception when others then v_s := v_s || case when sqlstate = 'P0002' then '/ok' else '/' || sqlstate end; end;
  perform register_hack_dataset(v_c, v_p1, 'v1.csv', 'text/csv', 1000);
  perform register_hack_dataset(v_c, v_p2, 'v2.csv', 'text/csv', 2000);
  insert into t_res values ('02_eintragen',
    case when v_s = 'ok/ok/ok'
          and (select storage_path from hack_dataset where challenge_id = v_c and is_current) = v_p2
          and (select count(*) from hack_dataset where challenge_id = v_c) = 2
          and exists (select 1 from audit_log a where a.action = 'hack.dataset_uploaded' and a.object_id = v_c::text)
         then 'ok' else v_s end);

  -- 03 Policy
  perform set_config('request.jwt.claims', json_build_object('sub', v_mem_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) filter (where name = v_p1), count(*) filter (where name = v_p2), count(*) filter (where name = v_pw)
    into v_n1, v_n2, v_nw from storage.objects where bucket_id = 'hack-datasets' and name in (v_p1, v_p2, v_pw);
  execute 'reset role';
  v_s := format('team v1=%s v2=%s w=%s', v_n1, v_n2, v_nw);
  perform set_config('request.jwt.claims', json_build_object('sub', v_oth_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id = 'hack-datasets' and name in (v_p1, v_p2, v_pw);
  execute 'reset role';
  insert into t_res values ('03_policy_team',
    case when v_n1 = 0 and v_n2 = 1 and v_nw = 0 and v_n = 0 then 'ok' else v_s || ' fremd=' || v_n end);

  -- 04
  perform set_config('request.jwt.claims', json_build_object('sub', v_mem_uid, 'role', 'authenticated')::text, true);
  select * into r from hack_challenge_dataset(v_c);
  perform set_config('request.jwt.claims', json_build_object('sub', v_oth_uid, 'role', 'authenticated')::text, true);
  begin perform * from hack_challenge_dataset(v_c); v_s := 'ALLOWED (BUG)';
  exception when others then v_s := case when sqlstate = '42501' then 'ok' else sqlstate end; end;
  insert into t_res values ('04_leserolle', case when v_s = 'ok' and r.storage_path = v_p2 and r.filename = 'v2.csv' then 'ok' else v_s || ' ' || coalesce(r::text, 'leer') end);

  -- 05 Partner, Waise
  perform set_config('request.jwt.claims', json_build_object('sub', v_par_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) filter (where name in (v_p1, v_p2)), count(*) filter (where name = v_pw)
    into v_n, v_nw from storage.objects where bucket_id = 'hack-datasets' and name in (v_p1, v_p2, v_pw);
  execute 'reset role';
  v_s := format('partner=%s waise=%s', v_n, v_nw);
  insert into role_assignment (person_id, role, scope_type) values (v_oth_pid, 'hackathon_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_oth_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n2 from storage.objects where bucket_id = 'hack-datasets' and name = v_pw;
  execute 'reset role';
  delete from role_assignment where person_id = v_oth_pid;
  insert into t_res values ('05_partner_waise', case when v_n = 2 and v_nw = 0 and v_n2 = 1 then 'ok' else v_s || ' hackteam_waise=' || v_n2 end);

  -- 06
  update hack_team set status = 'withdrawn' where id = v_t;
  perform set_config('request.jwt.claims', json_build_object('sub', v_mem_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id = 'hack-datasets' and name in (v_p1, v_p2);
  execute 'reset role';
  insert into t_res values ('06_zurueckgezogen_anon',
    case when v_n = 0
          and not has_function_privilege('anon', 'register_hack_dataset(uuid,text,text,text,bigint)', 'execute')
          and not has_function_privilege('anon', 'hack_challenge_dataset(uuid)', 'execute')
          and not has_function_privilege('anon', 'hack_dataset_path_allowed(text)', 'execute')
         then 'ok' else 'n=' || v_n end);

  -- 07
  perform set_config('request.jwt.claims', json_build_object('sub', v_par_uid, 'role', 'authenticated')::text, true);
  select string_agg(x.title || ':' || coalesce(x.filename, '-'), ',') into v_s from hack_dataset_targets() x where x.challenge_id in (v_c, v_c2);
  perform set_config('request.jwt.claims', json_build_object('sub', v_mem_uid, 'role', 'authenticated')::text, true);
  select count(*) into v_n from hack_dataset_targets() x where x.challenge_id in (v_c, v_c2);
  insert into t_res values ('07_pflegeliste', case when v_s = 'Daten-Test:v2.csv' and v_n = 0 then 'ok' else coalesce(v_s, 'leer') || ' team=' || v_n end);
end $$;
select * from t_res order by step;
rollback;
