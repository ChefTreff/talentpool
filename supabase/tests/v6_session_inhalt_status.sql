-- Smoke-Test zum Vorschlag v6_session_inhalt_status (SPK-050). Belegt:
--   01 eine einzelne übernommene Einreichung ist keine Änderung (is_change false)
--      — Vorbedingung, sonst belegte 02 nur, dass der Schlüssel immer true ist;
--   02 eine neue Einreichung nach einer übernommenen ist eine Änderung (true),
--      und `latest_submission` ist die neue (Status submitted);
--   03 eine übernommene Änderung bleibt eine Änderung (true);
--   04 eine erste, noch offene Einreichung ist keine Änderung (false);
--   05 was die Änderung nicht betrifft, kommt weiter mit (`tech`, `co_speakers`);
--   06 `authenticated` darf my_sessions() weiter ausführen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_ed uuid; v_prof uuid; v_se uuid; v_se2 uuid; v_sub2 uuid;
  v_ls jsonb; v_row record;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select sp.id into v_prof from speaker_profile sp where sp.person_id = v_pid and sp.edition_id = v_ed limit 1;
  if v_prof is null then
    insert into speaker_profile (person_id, edition_id) values (v_pid, v_ed) returning id into v_prof;
  end if;

  insert into session (event_id, format, title_de, title_en, language, access_mode, publish_status, tech)
  values (v_ed, 'keynote', 'ZZ Test Inhaltsstatus', 'ZZ Test content status', 'de', 'open', 'draft',
          '{"microphone": "headset"}'::jsonb)
  returning id into v_se;
  insert into session_speaker (session_id, person_id, role, confirmed) values (v_se, v_pid, 'speaker', true);
  insert into session_submission (session_id, speaker_profile_id, submitted_by, title, status, reviewed_at, created_at)
  values (v_se, v_prof, v_pid, 'Erste Fassung', 'approved', now() - interval '2 days', now() - interval '3 days');

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 01 · einzelne übernommene Einreichung
  select latest_submission into v_ls from my_sessions() where session_id = v_se;
  insert into t_res values ('01_erste_fassung', case when (v_ls->>'is_change') = 'false' then 'ok' else 'FEHLER ' || coalesce(v_ls::text, 'null') end);

  -- 02 · neue Einreichung nach der übernommenen
  insert into session_submission (session_id, speaker_profile_id, submitted_by, title, status, created_at)
  values (v_se, v_prof, v_pid, 'Zweite Fassung', 'submitted', now() - interval '1 day')
  returning id into v_sub2;
  select latest_submission into v_ls from my_sessions() where session_id = v_se;
  insert into t_res values ('02_aenderung_eingereicht',
    case when (v_ls->>'is_change') = 'true' and v_ls->>'status' = 'submitted' and v_ls->>'title' = 'Zweite Fassung'
         then 'ok' else 'FEHLER ' || coalesce(v_ls::text, 'null') end);

  -- 03 · die Änderung wird übernommen
  update session_submission set status = 'approved', reviewed_at = now() where id = v_sub2;
  select latest_submission into v_ls from my_sessions() where session_id = v_se;
  insert into t_res values ('03_aenderung_uebernommen',
    case when (v_ls->>'is_change') = 'true' and v_ls->>'status' = 'approved' then 'ok' else 'FEHLER ' || coalesce(v_ls::text, 'null') end);

  -- 04 · erste Einreichung, noch offen, an einer zweiten Session
  insert into session (event_id, format, title_de, language, access_mode, publish_status)
  values (v_ed, 'keynote', 'ZZ Test Inhaltsstatus 2', 'de', 'open', 'draft')
  returning id into v_se2;
  insert into session_speaker (session_id, person_id, role, confirmed) values (v_se2, v_pid, 'speaker', true);
  insert into session_submission (session_id, speaker_profile_id, submitted_by, title, status)
  values (v_se2, v_prof, v_pid, 'Nur eine', 'submitted');
  select latest_submission into v_ls from my_sessions() where session_id = v_se2;
  insert into t_res values ('04_erste_offen', case when (v_ls->>'is_change') = 'false' then 'ok' else 'FEHLER ' || coalesce(v_ls::text, 'null') end);

  -- 05 · unberührte Spalten
  select * into v_row from my_sessions() where session_id = v_se;
  insert into t_res values ('05_andere_spalten',
    case when v_row.tech->>'microphone' = 'headset' and jsonb_typeof(v_row.co_speakers) = 'array'
              and v_row.title_de = 'ZZ Test Inhaltsstatus'
         then 'ok' else 'FEHLER ' || coalesce(v_row.tech::text, 'null') end);

  -- 06 · Recht
  insert into t_res values ('06_grant',
    case when has_function_privilege('authenticated', 'my_sessions()', 'execute') then 'ok' else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
