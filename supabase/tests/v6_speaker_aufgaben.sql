-- Smoke-Test 0149 (Aufgaben zum Selbst-Abhaken, SPK-024). Belegt:
--   01 das Team legt eine Aufgabe an;
--   02 der Speaker sieht sie, ungehakt;
--   03 er hakt ab — `done_at` steht, und es steht dabei, wer es war;
--   04 er nimmt den Haken wieder weg;
--   05 eine Aufgabe aus einer **fremden Edition** wird abgewiesen
--      (P0001 task_wrong_edition) — eine geratene Kennung reicht nicht;
--   06 eine **stillgelegte** Aufgabe wird abgewiesen (P0001 task_inactive)
--      und taucht in der eigenen Liste nicht mehr auf;
--   07 der Speaker selbst darf keine Aufgabe anlegen (42501);
--   08 **löschen mit Haken wird abgewiesen** (P0001 task_has_ticks) — sonst
--      verschwände mit der Zeile auch, wer wann „erledigt" gesagt hat;
--   09 ohne Haken laesst sie sich loeschen.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ed2 uuid; v_profile uuid;
  v_task uuid; v_fremd uuid; v_json jsonb; v_n integer; v_by uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  -- Irgendeine andere Edition; gibt es keine, wird eine angelegt (wird
  -- zurueckgerollt wie alles andere hier).
  select e.id into v_ed2 from event e where e.is_edition and e.id <> v_ed limit 1;
  if v_ed2 is null then
    insert into event (name, slug, is_edition, format_tag)
    select 'Testedition', 'test-0149', true, e.format_tag from event e where e.id = v_ed
      returning id into v_ed2;
  end if;

  select sp.id into v_profile from speaker_profile sp
   where sp.person_id = v_pid and sp.edition_id = v_ed limit 1;
  if v_profile is null then
    insert into speaker_profile (person_id, edition_id) values (v_pid, v_ed) returning id into v_profile;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 07 · ohne Rolle darf er nicht anlegen
  begin
    perform upsert_speaker_task(jsonb_build_object(
      'edition_id', v_ed, 'key', 'test_selbst', 'label_de', 'Test', 'label_en', 'Test'));
    insert into t_res values ('07_speaker_darf_nicht_anlegen', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('07_speaker_darf_nicht_anlegen', 'abgewiesen ' || sqlstate);
  end;

  -- 01 · das Team legt an
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  v_task := upsert_speaker_task(jsonb_build_object(
    'edition_id', v_ed, 'key', 'test_hotel_gemeldet',
    'label_de', 'Beim Hotel gemeldet', 'label_en', 'Contacted the hotel',
    'description_de', 'Kurz Bescheid geben.', 'sort_order', 5));
  v_fremd := upsert_speaker_task(jsonb_build_object(
    'edition_id', v_ed2, 'key', 'test_fremd', 'label_de', 'Fremd', 'label_en', 'Foreign'));
  insert into t_res values ('01_angelegt',
    case when v_task is not null then 'ok' else 'FEHLER' end);
  delete from role_assignment where person_id = v_pid;

  -- 02 · der Speaker sieht sie, ungehakt
  v_json := my_speaker_tasks(null);
  insert into t_res values ('02_sichtbar_ungehakt',
    case when jsonb_path_exists(v_json, '$[*] ? (@.key == "test_hotel_gemeldet" && @.done_at == null)')
         then 'ok, steht da und ist offen' else 'FEHLER ' || v_json::text end);

  -- 03 · abhaken
  perform set_speaker_task_tick(v_task, true);
  select done_by into v_by from speaker_task_tick where task_id = v_task and profile_id = v_profile;
  v_json := my_speaker_tasks(null);
  insert into t_res values ('03_abgehakt',
    case when v_by = v_pid
              and jsonb_path_exists(v_json, '$[*] ? (@.key == "test_hotel_gemeldet" && @.done_at <> null)')
         then 'ok, Haken steht mit Urheber' else 'FEHLER ' || coalesce(v_by::text, 'null') end);

  -- 05 · fremde Edition
  begin
    perform set_speaker_task_tick(v_fremd, true);
    insert into t_res values ('05_fremde_edition', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('05_fremde_edition', 'abgewiesen ' || sqlstate);
  end;

  -- 04 · Haken wieder weg
  perform set_speaker_task_tick(v_task, false);
  select count(*) into v_n from speaker_task_tick where task_id = v_task and profile_id = v_profile;
  insert into t_res values ('04_haken_weg',
    case when v_n = 0 then 'ok' else 'FEHLER ' || v_n::text end);

  -- 08 · loeschen mit Haken
  perform set_speaker_task_tick(v_task, true);
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  begin
    perform delete_speaker_task(v_task);
    insert into t_res values ('08_loeschen_mit_haken', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('08_loeschen_mit_haken', 'abgewiesen ' || sqlstate);
  end;

  -- 06 · stillgelegt: nicht mehr sichtbar und nicht mehr hakbar
  perform upsert_speaker_task(jsonb_build_object(
    'edition_id', v_ed, 'key', 'test_hotel_gemeldet',
    'label_de', 'Beim Hotel gemeldet', 'label_en', 'Contacted the hotel', 'is_active', false));
  select jsonb_agg(x) into v_json
    from jsonb_array_elements(my_speaker_tasks(v_profile)) x
   where x->>'key' = 'test_hotel_gemeldet';
  delete from role_assignment where person_id = v_pid;
  begin
    perform set_speaker_task_tick(v_task, false);
    insert into t_res values ('06b_stillgelegt_nicht_hakbar', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('06b_stillgelegt_nicht_hakbar', 'abgewiesen ' || sqlstate);
  end;
  insert into t_res values ('06a_stillgelegt_unsichtbar',
    case when v_json is null then 'ok, weg aus der Liste' else 'FEHLER ' || v_json::text end);

  -- 09 · ohne Haken loeschbar
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'area_lead_speaker', 'global');
  delete from speaker_task_tick where task_id = v_task;
  perform delete_speaker_task(v_task);
  select count(*) into v_n from speaker_task where id = v_task;
  insert into t_res values ('09_ohne_haken_loeschbar',
    case when v_n = 0 then 'ok' else 'FEHLER: steht noch' end);
  delete from role_assignment where person_id = v_pid;
end $$;
select * from t_res order by step;
rollback;
