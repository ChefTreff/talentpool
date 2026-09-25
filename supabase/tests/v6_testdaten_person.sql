-- Smoke-Test zum Vorschlag v6_testdaten_person. Belegt:
--   01 ohne Konto (wie service_role) entsteht eine TEST-Person mit **einer** primären
--      E-Mail — der verzögerte Trigger `trg_person_primary_email` ist zufrieden
--   02 ein zweiter Aufruf mit derselben Adresse gibt dieselbe Person zurück
--   03 mit angemeldetem Konto: 42501
--   04 Vorname nicht TEST oder Adresse ohne `+zztest`: 22023 `not_test_data`
--   05 kein EXECUTE für authenticated und anon
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_pid uuid; v_pid2 uuid; v_uid uuid; v_n int;
begin
  -- 01 · ohne Konto
  perform set_config('request.jwt.claims', null, true);
  begin
    v_pid := testdaten_person('TEST', 'Pipeline Probe', 'konrad+zztest-probe@chef-treff.de');
    select count(*) into v_n from person_email where person_id = v_pid and is_primary;
    -- Den verzögerten Trigger jetzt schon prüfen lassen, nicht erst beim Commit.
    set constraints all immediate;
    insert into t_res values ('01_anlegen', case when v_n = 1 then 'ok' else 'FEHLER n=' || v_n end);
  exception when others then
    insert into t_res values ('01_anlegen', 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 02 · idempotent
  begin
    v_pid2 := testdaten_person('TEST', 'Pipeline Probe', 'konrad+zztest-probe@chef-treff.de');
    insert into t_res values ('02_idempotent', case when v_pid2 = v_pid then 'ok' else 'FEHLER' end);
  exception when others then
    insert into t_res values ('02_idempotent', 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 03 · mit Konto
  select p.auth_user_id into v_uid from person p where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  begin
    perform testdaten_person('TEST', 'Pipeline Probe 2', 'konrad+zztest-probe2@chef-treff.de');
    insert into t_res values ('03_mit_konto', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('03_mit_konto', case when sqlstate = '42501' then 'ok' else 'FEHLER ' || sqlstate end);
  end;
  perform set_config('request.jwt.claims', null, true);

  -- 04 · keine Testdaten
  begin
    perform testdaten_person('Anna', 'Echt', 'konrad+zztest-x@chef-treff.de');
    insert into t_res values ('04_kein_test', 'ERLAUBT (BUG)');
  exception when others then
    begin
      perform testdaten_person('TEST', 'Echt', 'jemand@example.com');
      insert into t_res values ('04_kein_test', 'ERLAUBT (BUG) Adresse');
    exception when others then
      insert into t_res values ('04_kein_test', case when sqlstate = '22023' and sqlerrm = 'not_test_data' then 'ok' else 'FEHLER ' || sqlstate end);
    end;
  end;

  -- 05 · Rechte
  insert into t_res values ('05_grants',
    case when to_regprocedure('testdaten_person(text, text, text)') is null then 'FEHLER fehlt'
         when not has_function_privilege('authenticated', 'testdaten_person(text, text, text)', 'execute')
          and not has_function_privilege('anon', 'testdaten_person(text, text, text)', 'execute') then 'ok'
         else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
