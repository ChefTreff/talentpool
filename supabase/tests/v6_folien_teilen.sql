-- Smoke-Test zum Vorschlag v6_folien_teilen (SPK-055). Belegt:
--   01 die Speakerin teilt ihre Präsentation (mit Einwilligung) — Vorbedingung,
--      sonst belegten die Abweisungen nur, dass gar nichts geht;
--   02 ohne Einwilligung wird nicht geteilt (P0001 consent_required);
--   03 ein Foto lässt sich nicht teilen (22023 not_presentation);
--   04 eine fremde Person bekommt 42501;
--   05 **ein Konto ohne Person bekommt 42501** — gegen die Live-Fassung ging
--      genau dieser Fall durch;
--   06 zurücknehmen geht.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_ed uuid; v_prof uuid; v_pres uuid; v_foto uuid;
  v_other uuid; v_uid2 uuid; v_nach boolean;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select sp.id into v_prof from speaker_profile sp where sp.person_id = v_pid and sp.edition_id = v_ed limit 1;
  if v_prof is null then
    insert into speaker_profile (person_id, edition_id) values (v_pid, v_ed) returning id into v_prof;
  end if;
  insert into speaker_asset (profile_id, kind, storage_path, filename, version, is_current)
  values (v_prof, 'presentation', v_ed || '/' || v_prof || '/presentation/test.pdf', 'test.pdf', 1, true)
  returning id into v_pres;
  insert into speaker_asset (profile_id, kind, storage_path, filename, version, is_current)
  values (v_prof, 'photo', v_ed || '/' || v_prof || '/photo/test.jpg', 'test.jpg', 1, true)
  returning id into v_foto;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 02 · ohne Einwilligung (vorher ausdrücklich abgelehnt)
  insert into consent_record (person_id, consent_type, version, granted, source)
  values (v_pid, 'slides_publication', '2026-09', false, 'portal');
  begin
    perform set_slides_release(v_pres, true);
    insert into t_res values ('02_ohne_einwilligung', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('02_ohne_einwilligung', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 01 · mit Einwilligung
  insert into consent_record (person_id, consent_type, version, granted, source)
  values (v_pid, 'slides_publication', '2026-09', true, 'portal');
  perform set_slides_release(v_pres, true);
  select slides_release into v_nach from speaker_asset where id = v_pres;
  insert into t_res values ('01_teilen', case when v_nach then 'ok' else 'FEHLER' end);

  -- 03 · Foto
  begin
    perform set_slides_release(v_foto, true);
    insert into t_res values ('03_foto', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('03_foto', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 04 · fremde Person (Konto geliehen)
  select p.id, p.auth_user_id into v_other, v_uid2 from person p where p.auth_user_id is not null and p.id <> v_pid limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid2, 'role', 'authenticated')::text, true);
  begin
    perform set_slides_release(v_pres, false);
    insert into t_res values ('04_fremde_person', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('04_fremde_person', 'abgewiesen ' || sqlstate);
  end;

  -- 05 · Konto ohne Person — das Loch aus der Live-Fassung
  update person set auth_user_id = null where id = v_other;
  begin
    perform set_slides_release(v_pres, false);
    insert into t_res values ('05_konto_ohne_person', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('05_konto_ohne_person', 'abgewiesen ' || sqlstate);
  end;
  select slides_release into v_nach from speaker_asset where id = v_pres;
  insert into t_res values ('05b_freigabe_unveraendert', case when v_nach then 'ok, noch geteilt' else 'FEHLER: zurückgesetzt' end);

  -- 06 · zurücknehmen durch die Speakerin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_slides_release(v_pres, false);
  select slides_release into v_nach from speaker_asset where id = v_pres;
  insert into t_res values ('06_zuruecknehmen', case when not v_nach then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
