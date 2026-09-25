-- Smoke-Test zum Vorschlag v6_regie_anweisungen (LEAD-031). Belegt:
--   L  Stage Lead (`speaker_manager` mit Scope auf Test-Bühne S)
--      01 sieht den Slot seiner Bühne in `lead_regie_slots` — Vorbedingung
--      02 setzt Anweisungen: es entsteht **ein** Cue mit den Zeiten des Slots,
--         Mikrofon und Medien als `{"text": …}`
--      03 ein zweiter Aufruf ändert nur den mitgeschickten Schlüssel
--      04 Zeiten sind nicht schreibbar (P0001 `not_editable`)
--      05 `upsert_regie_cue` weist ihn ab (42501)          (gegen live: ERLAUBT)
--      06 `delete_regie_cue` weist ihn ab (42501)          (gegen live: ERLAUBT)
--   X  ohne Rolle
--      07 sieht nichts und darf nichts (42501)
--   P  Produktion (`production_team`)
--      08 überschreibt Anweisungen und verschiebt den Cue über `upsert_regie_cue`
--   I  Programm-Team der Edition
--      09 darf den Plan weiter schreiben (der Abschnitt `/admin/regie` steht ihm offen)
--   10 EXECUTE für `authenticated` an den neuen Funktionen
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_ed uuid; v_day uuid; v_tag date; v_s uuid; v_sl uuid; v_se uuid; v_cue uuid; v_cue2 uuid;
  v_pl uuid; v_ul uuid; v_px uuid; v_ux uuid; v_n int; v_r record; v_start timestamptz;
  v_sl_plan uuid; v_cue_plan uuid;
begin
  -- ---- Aufbau
  select e.id into v_ed from event e where e.is_edition and e.slug = 'fls27';
  select d.id, d.day_date into v_day, v_tag from event_day d where d.event_id = v_ed order by d.day_date limit 1;
  select p.id, p.auth_user_id into v_pl, v_ul from person p where p.auth_user_id is not null order by p.created_at limit 1;
  select p.id, p.auth_user_id into v_px, v_ux from person p where p.auth_user_id is not null and p.id <> v_pl order by p.created_at limit 1;
  delete from role_assignment where person_id in (v_pl, v_px);
  insert into stage (event_id, name, slug, type, active) values (v_ed, 'ZZ Test Regie-Bühne', 'zz-test-regie', 'side', true) returning id into v_s;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_s, v_day, v_tag + time '14:00', v_tag + time '14:30', 'content', 'open') returning id into v_sl;
  insert into session (event_id, slot_id, format, title_de, language, access_mode, publish_status)
  values (v_ed, v_sl, 'talk', 'ZZ Test Regie-Talk', 'de', 'open', 'draft') returning id into v_se;
  -- Ein zweiter Slot mit einem Cue der Produktion — daran prüfen 05/06, ob der
  -- Stage Lead den Plan ändern kann (gegen live: ja).
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_s, v_day, v_tag + time '15:00', v_tag + time '15:30', 'content', 'open') returning id into v_sl_plan;
  insert into regie_cue (stage_id, event_day_id, slot_id, cue_start, cue_end, action)
  values (v_s, v_day, v_sl_plan, v_tag + time '15:00', v_tag + time '15:30', 'Auftritt') returning id into v_cue_plan;
  insert into role_assignment (person_id, role, scope_type, scope_id) values (v_pl, 'speaker_manager', 'stage', v_s);

  -- ---- L
  perform set_config('request.jwt.claims', json_build_object('sub', v_ul, 'role', 'authenticated')::text, true);
  begin
    select count(*) into v_n from lead_regie_slots() r where r.slot_id = v_sl and r.title = 'ZZ Test Regie-Talk';
    insert into t_res values ('01_L_sieht_slot', case when v_n = 1 then 'ok' else 'FEHLER ' || v_n end);
  exception when others then
    insert into t_res values ('01_L_sieht_slot', 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;

  begin
    v_cue := set_regie_anweisungen(v_sl, '{"people_on_stage": "2 Personen", "mic": "Headset + Handmikro", "media": "Clicker", "mobiliar": "2 Sessel", "notes": "Wasser"}'::jsonb);
    select * into v_r from regie_cue where id = v_cue;
    select count(*) into v_n from regie_cue where slot_id = v_sl;
    insert into t_res values ('02_L_anweisungen',
      case when v_n = 1 and v_r.cue_start = v_tag + time '14:00' and v_r.cue_end = v_tag + time '14:30'
                and v_r.mic_assignments->>'text' = 'Headset + Handmikro' and v_r.media->>'text' = 'Clicker'
                and v_r.people_on_stage = '2 Personen' and v_r.mobiliar = '2 Sessel' and v_r.notes = 'Wasser'
                and v_r.action = 'ZZ Test Regie-Talk'
           then 'ok' else 'FEHLER n=' || v_n end);
  exception when others then
    insert into t_res values ('02_L_anweisungen', 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;

  begin
    v_cue2 := set_regie_anweisungen(v_sl, '{"notes": "Wasser, still"}'::jsonb);
    select * into v_r from regie_cue where id = v_cue2;
    insert into t_res values ('03_L_teilupdate',
      case when v_cue2 = v_cue and v_r.notes = 'Wasser, still' and v_r.mobiliar = '2 Sessel'
                and v_r.mic_assignments->>'text' = 'Headset + Handmikro'
           then 'ok' else 'FEHLER' end);
  exception when others then
    insert into t_res values ('03_L_teilupdate', 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;

  begin
    perform set_regie_anweisungen(v_sl, '{"cue_start": "2027-04-16T08:00:00Z"}'::jsonb);
    insert into t_res values ('04_L_keine_zeiten', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('04_L_keine_zeiten', case when sqlstate = 'P0001' and sqlerrm = 'not_editable' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end);
  end;

  begin
    perform upsert_regie_cue(jsonb_build_object('id', v_cue_plan, 'cue_start', (v_tag + time '14:50')::text));
    insert into t_res values ('05_L_plan_upsert', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('05_L_plan_upsert', case when sqlstate = '42501' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end);
  end;

  begin
    perform delete_regie_cue(v_cue_plan);
    insert into t_res values ('06_L_plan_loeschen', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('06_L_plan_loeschen', case when sqlstate = '42501' then 'ok' else 'FEHLER ' || sqlstate || ' ' || sqlerrm end);
  end;

  -- ---- X ohne Rolle
  perform set_config('request.jwt.claims', json_build_object('sub', v_ux, 'role', 'authenticated')::text, true);
  begin
    select count(*) into v_n from lead_regie_slots() r where r.slot_id = v_sl;
    begin
      perform set_regie_anweisungen(v_sl, '{"notes": "x"}'::jsonb);
      insert into t_res values ('07_X_nichts', 'ERLAUBT (BUG)');
    exception when others then
      insert into t_res values ('07_X_nichts', case when sqlstate = '42501' and v_n = 0 then 'ok' else 'FEHLER ' || sqlstate || ' n=' || v_n end);
    end;
  exception when others then
    insert into t_res values ('07_X_nichts', 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;

  -- ---- P Produktion
  insert into role_assignment (person_id, role, scope_type) values (v_px, 'production_team', 'global');
  begin
    perform set_regie_anweisungen(v_sl, '{"mobiliar": "3 Sessel"}'::jsonb);
    v_start := v_tag + time '14:05';
    perform upsert_regie_cue(jsonb_build_object('id', v_cue, 'cue_start', v_start::text));
    select * into v_r from regie_cue where id = v_cue;
    insert into t_res values ('08_P_ueberschreibt',
      case when v_r.mobiliar = '3 Sessel' and v_r.cue_start = v_start then 'ok' else 'FEHLER' end);
  exception when others then
    insert into t_res values ('08_P_ueberschreibt', 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;

  -- ---- I Programm-Team der Edition
  delete from role_assignment where person_id = v_px;
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_px, 'programme_team', 'edition', v_ed);
  begin
    perform upsert_regie_cue(jsonb_build_object('id', v_cue, 'regie', 'Licht aus'));
    insert into t_res values ('09_I_plan', case when (select regie from regie_cue where id = v_cue) = 'Licht aus' then 'ok' else 'FEHLER' end);
  exception when others then
    insert into t_res values ('09_I_plan', 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;

  -- ---- Rechte
  insert into t_res values ('10_grants',
    case when to_regprocedure('set_regie_anweisungen(uuid, jsonb)') is null or to_regprocedure('lead_regie_slots()') is null then 'FEHLER fehlt'
         when has_function_privilege('authenticated', 'set_regie_anweisungen(uuid, jsonb)', 'execute')
          and has_function_privilege('authenticated', 'lead_regie_slots()', 'execute') then 'ok'
         else 'FEHLER' end);
end $$;
select * from t_res order by step;
rollback;
