-- Smoke-Test zum Vorschlag v6_technik_laptop_video (SPK-067). Belegt:
--   01 ein Häkchen wird als echter Wahrheitswert gespeichert, ein Nein fällt
--      heraus;
--   02 die Textfelder daneben gehen weiter;
--   03 ein Wert, der kein Ja/Nein ist, wird abgewiesen (22023);
--   04 abwählen entfernt den Schlüssel wieder — sonst liesse sich ein
--      Häkchen nie zurücknehmen;
--   05 die Regie bekommt den Wahrheitswert über `regie_view` mit.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_ev uuid; v_ed uuid; v_se uuid; v_tech jsonb; v_n integer;
  v_tz text; v_day event_day%rowtype; v_stage uuid; v_slot uuid; v_start timestamptz;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select ev.id into v_ev from event ev where coalesce(ev.edition_id, ev.id) = v_ed
     and exists (select 1 from stage s where s.event_id = ev.id) limit 1;
  if not exists (select 1 from speaker_profile where person_id = v_pid and edition_id = v_ed) then
    insert into speaker_profile (person_id, edition_id) values (v_pid, v_ed);
  end if;
  -- Die Regie sieht eine Session nur über einen Slot mit Regie-Eintrag — ohne
  -- das belegte Schritt 05 nichts.
  select ev.timezone into v_tz from event ev where ev.id = v_ev;
  select ed.* into v_day from event_day ed where ed.event_id = v_ev order by ed.day_date limit 1;
  v_start := (v_day.day_date + time '15:00') at time zone v_tz;
  insert into stage (event_id, name, slug) values (v_ev, 'Technik Test', 'technik-test-' || substr(gen_random_uuid()::text, 1, 6))
    returning id into v_stage;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type)
  values (v_stage, v_day.id, v_start, v_start + interval '30 minutes', 'content') returning id into v_slot;
  insert into session (event_id, format, title_de, slot_id) values (v_ev, 'talk', 'Technik Probe', v_slot) returning id into v_se;
  insert into regie_cue (stage_id, event_day_id, slot_id, cue_start, cue_end, action)
  values (v_stage, v_day.id, v_slot, v_start, v_start + interval '30 minutes', 'Talk');
  insert into session_speaker (session_id, person_id, role, sort_order) values (v_se, v_pid, 'speaker', 0);

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 01/02 · Häkchen und Text zusammen
  perform update_session_tech(v_se, jsonb_build_object(
    'microphone', 'headset', 'special_requirements', 'Ein Stehtisch',
    'own_laptop', true, 'video_with_sound', false));
  select tech into v_tech from session where id = v_se;
  insert into t_res values ('01_ja_als_wahrheitswert',
    case when jsonb_typeof(v_tech->'own_laptop') = 'boolean' and (v_tech->>'own_laptop')::boolean
              and not (v_tech ? 'video_with_sound')
         then 'ok, true gespeichert, Nein weggelassen' else 'FEHLER ' || v_tech::text end);
  insert into t_res values ('02_text_daneben',
    case when v_tech->>'microphone' = 'headset' and v_tech->>'special_requirements' = 'Ein Stehtisch'
         then 'ok' else 'FEHLER ' || v_tech::text end);

  -- 03 · kein Ja/Nein
  begin
    perform update_session_tech(v_se, jsonb_build_object('own_laptop', 'ja'));
    insert into t_res values ('03_kein_ja_nein', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('03_kein_ja_nein', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 05 · die Regie sieht es (vor dem Abwählen)
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'programme_team', 'global');
  select count(*) into v_n from regie_view(v_stage, v_day.id) r
   where r.session_id = v_se and jsonb_typeof(r.tech->'own_laptop') = 'boolean';
  delete from role_assignment where person_id = v_pid;
  insert into t_res values ('05_regie_sieht_es',
    case when v_n >= 1 then 'ok' else 'FEHLER: ' || v_n || ' Zeilen (Session ohne Cue?)' end);

  -- 04 · abwählen
  perform update_session_tech(v_se, jsonb_build_object(
    'microphone', 'headset', 'special_requirements', 'Ein Stehtisch',
    'own_laptop', false, 'video_with_sound', false));
  select tech into v_tech from session where id = v_se;
  insert into t_res values ('04_abwaehlen',
    case when not (v_tech ? 'own_laptop') then 'ok, Schlüssel weg' else 'FEHLER ' || v_tech::text end);
end $$;
select * from t_res order by step;
rollback;
