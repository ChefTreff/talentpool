-- Smoke-Test 0121 (Technik-Ansage im Regieplan). Belegt:
--   01 die Spalte `tech` ist da und steht **hinten**, die bisherigen Spalten
--      sind unveraendert (Lehre aus 0099: drop + create verliert sonst still
--      eine Spalte);
--   02 `authenticated` darf die Funktion ausfuehren, `anon` nicht — der drop
--      hat die Grants mitgenommen, sie muessen zurueckgegeben sein;
--   03 ohne Zustaendigkeit fuer die Buehne bleibt die Regie zu (42501);
--   04 ein Cue **mit** Session zeigt die Ansage des Speakers;
--   05 ein Cue **ohne** Session (Doors open, Puffer) zeigt ein leeres Objekt,
--      nicht null;
--   06 die Disposition der Regie steht unveraendert daneben: `mic_assignments`
--      bleibt, was die Regie gesetzt hat, auch wenn die Ansage etwas anderes
--      sagt — sonst waere unklar, welche der beiden Angaben gilt.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_event uuid;
  v_stage uuid; v_fremd uuid; v_day uuid; v_slot uuid; v_session uuid;
  v_cue_mit uuid; v_cue_ohne uuid; v_spalten text; v_n integer; v_tech jsonb; v_mic jsonb;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  -- Testperson ohne Vorrechte; `staff_user` gibt es seit 20260917183022 nicht mehr.
  delete from role_assignment where person_id = v_pid;
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select e.id into v_event from event e where e.edition_id = v_ed or e.id = v_ed
   order by e.start_date limit 1;

  -- 01 · Spaltenliste
  select pg_get_function_result(pr.oid) into v_spalten
    from pg_proc pr
   where pr.proname = 'regie_view' and pr.pronamespace = 'public'::regnamespace;
  insert into t_res values ('01_spalten',
    case when v_spalten like '%mic_assignments jsonb%'
          and v_spalten like '%media jsonb%'
          and v_spalten like '%speakers jsonb, tech jsonb%'
         then 'ok, alte Spalten + tech hinten'
         else 'FEHLER ' || coalesce(v_spalten, 'null') end);

  -- 02 · Grants nach drop + create
  insert into t_res values ('02a_authenticated_darf',
    case when has_function_privilege('authenticated', 'regie_view(uuid,uuid)', 'execute')
         then 'ok' else 'FEHLER (Grant fehlt)' end);
  insert into t_res values ('02b_anon_darf_nicht',
    case when has_function_privilege('anon', 'regie_view(uuid,uuid)', 'execute')
         then 'ERLAUBT (BUG)' else 'gesperrt' end);

  -- Aufbau: eigene Buehne, fremde Buehne, ein Tag, ein Slot mit Session.
  insert into stage (event_id, name, slug, sort_order, active)
    values (v_event, 'ZZ Regie-Technik', 'zz-regie-tech', 910, true) returning id into v_stage;
  insert into stage (event_id, name, slug, sort_order, active)
    values (v_event, 'ZZ Regie-Fremd', 'zz-regie-fremd', 911, true) returning id into v_fremd;
  select d.id into v_day from event_day d where d.event_id = v_event order by d.day_date limit 1;
  if v_day is null then
    insert into event_day (event_id, day_date, sort_order) values (v_event, current_date + 200, 1)
      returning id into v_day;
  end if;

  insert into slot (stage_id, event_day_id, start_at, end_at)
    values (v_stage, v_day, now() + interval '200 days', now() + interval '200 days 1 hour')
    returning id into v_slot;
  insert into session (event_id, slot_id, format, title_de, tech)
    values (v_event, v_slot, 'keynote', 'ZZ Regie-Session',
            jsonb_build_object('microphone', 'Headset', 'people_on_stage', 'zwei Personen'))
    returning id into v_session;

  insert into regie_cue (stage_id, event_day_id, slot_id, cue_start, cue_end, action, mic_assignments)
    values (v_stage, v_day, v_slot, now() + interval '200 days',
            now() + interval '200 days 1 hour', 'Session',
            jsonb_build_object('kanal', 'HS-3'))
    returning id into v_cue_mit;
  insert into regie_cue (stage_id, event_day_id, cue_start, cue_end, action)
    values (v_stage, v_day, now() + interval '199 days',
            now() + interval '199 days 30 minutes', 'Doors open')
    returning id into v_cue_ohne;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  -- 03 · ohne Zustaendigkeit
  begin
    perform count(*) from regie_view(v_stage, v_day);
    insert into t_res values ('03_ohne_rolle', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('03_ohne_rolle', 'abgewiesen ' || sqlstate); end;

  -- Ab hier zustaendig fuer **diese** Buehne.
  insert into role_assignment (person_id, role, scope_type, scope_id)
    values (v_pid, 'speaker_manager', 'stage', v_stage);

  -- 04 · Cue mit Session traegt die Ansage
  select r.tech into v_tech from regie_view(v_stage, v_day) r where r.cue_id = v_cue_mit;
  insert into t_res values ('04_ansage_sichtbar',
    case when v_tech->>'microphone' = 'Headset' and v_tech->>'people_on_stage' = 'zwei Personen'
         then 'ok' else 'FEHLER ' || coalesce(v_tech::text, 'null') end);

  -- 05 · Cue ohne Session: leeres Objekt, nicht null
  select r.tech into v_tech from regie_view(v_stage, v_day) r where r.cue_id = v_cue_ohne;
  insert into t_res values ('05_ohne_session',
    case when v_tech = '{}'::jsonb then 'ok, leeres Objekt'
         when v_tech is null then 'FEHLER null'
         else 'FEHLER ' || v_tech::text end);

  -- 06 · Disposition bleibt unberuehrt
  select r.mic_assignments into v_mic from regie_view(v_stage, v_day) r where r.cue_id = v_cue_mit;
  insert into t_res values ('06_disposition_getrennt',
    case when v_mic->>'kanal' = 'HS-3' then 'ok, Regie behaelt ihre Angabe'
         else 'FEHLER ' || coalesce(v_mic::text, 'null') end);

  -- 07 · fremde Buehne bleibt zu (die Regel aus 0101 gilt unveraendert weiter)
  begin
    perform count(*) from regie_view(v_fremd, v_day);
    insert into t_res values ('07_fremde_buehne', 'ERLAUBT (BUG)');
  exception when others then insert into t_res values ('07_fremde_buehne', 'abgewiesen ' || sqlstate); end;
end $$;
select * from t_res order by step;
rollback;
