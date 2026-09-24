-- Smoke-Test zum Vorschlag v6_lead_tagesrahmen (LEAD-016). Belegt mit einem
-- **reinen** Stage-Lead-Konto (alle anderen Rollen entzogen):
--   01 der Rahmen bindet den Stage Lead;
--   02 anlegen **innerhalb** des Rahmens geht — Vorbedingung, sonst belegten
--      die Abweisungen nur, dass er gar nichts darf;
--   03 anlegen vor der Öffnung wird abgewiesen (P0001 outside_stage_day);
--   04 verschieben innerhalb geht;
--   05 verschieben über das Ende hinaus wird abgewiesen;
--   06 ohne Rahmen (Zeiten leer) keine Grenze;
--   07 admin: der Rahmen bindet nicht, verschieben über das Ende geht und
--      bringt die Warnung `after_close` wie bisher.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_stage uuid; v_tz text; v_day event_day%rowtype; v_sd uuid;
  v_slot uuid; v_res jsonb; v_innen timestamptz; v_vorher timestamptz; v_spaet timestamptz;
  v_frueh timestamptz;
begin
  select p.id, p.auth_user_id into v_pid, v_uid
    from person p where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;

  -- Eine **eigene** Testbühne auf einer Veranstaltung mit Tag — Bestandsslots
  -- anzufassen verbietet sich (veröffentlichte Sessions hängen daran), und
  -- Überschneidungen mit fremden Slots würden den Test verfälschen.
  select ev.id, ev.timezone into v_stage, v_tz
    from event ev where exists (select 1 from event_day ed where ed.event_id = ev.id)
   order by ev.start_date limit 1;
  insert into stage (event_id, name, slug)
  values (v_stage, 'Testbühne Tagesrahmen', 'test-tagesrahmen-' || substr(gen_random_uuid()::text, 1, 8))
  returning id into v_stage;
  select ed.* into v_day from event_day ed join stage st on st.event_id = ed.event_id
   where st.id = v_stage order by ed.day_date limit 1;
  insert into stage_day (stage_id, event_day_id, open_from, open_to)
  values (v_stage, v_day.id, time '10:00', time '18:00')
  on conflict (stage_id, event_day_id) do update set open_from = excluded.open_from, open_to = excluded.open_to
  returning id into v_sd;

  v_innen  := (v_day.day_date + time '10:00') at time zone v_tz;
  v_vorher := (v_day.day_date + time '09:00') at time zone v_tz;
  v_spaet  := (v_day.day_date + time '17:45') at time zone v_tz;
  v_frueh  := (v_day.day_date + time '07:00') at time zone v_tz;

  insert into role_assignment (person_id, role, scope_type, scope_id)
  values (v_pid, 'speaker_manager', 'stage', v_stage);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  insert into t_res values ('01_rahmen_bindet_lead',
    case when stage_frame_binds(v_stage) then 'ok' else 'FEHLER: bindet nicht' end);

  -- 02 · innerhalb
  v_slot := create_slot(v_stage, v_innen, v_innen + interval '30 minutes');
  insert into t_res values ('02_anlegen_innerhalb',
    case when v_slot is not null then 'ok, angelegt' else 'FEHLER' end);

  -- 03 · vor der Öffnung
  begin
    perform create_slot(v_stage, v_vorher, v_vorher + interval '30 minutes');
    insert into t_res values ('03_anlegen_vor_oeffnung', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('03_anlegen_vor_oeffnung', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 04 · verschieben innerhalb
  v_res := move_slot(v_slot, v_stage, v_innen + interval '1 hour', v_innen + interval '90 minutes');
  insert into t_res values ('04_verschieben_innerhalb',
    case when v_res is not null then 'ok' else 'FEHLER' end);

  -- 05 · über das Ende hinaus
  begin
    perform move_slot(v_slot, v_stage, v_spaet, v_spaet + interval '30 minutes');
    insert into t_res values ('05_verschieben_ueber_ende', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('05_verschieben_ueber_ende', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 06 · ohne Rahmen
  update stage_day set open_from = null, open_to = null where id = v_sd;
  v_slot := create_slot(v_stage, v_frueh, v_frueh + interval '30 minutes');
  insert into t_res values ('06_ohne_rahmen_frei',
    case when v_slot is not null then 'ok, keine Grenze' else 'FEHLER' end);
  update stage_day set open_from = time '10:00', open_to = time '18:00' where id = v_sd;

  -- 07 · admin behält die Warnung
  delete from role_assignment where person_id = v_pid;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  insert into t_res values ('07a_admin_nicht_gebunden',
    case when stage_frame_binds(v_stage) then 'FEHLER: bindet' else 'ok' end);
  v_res := move_slot(v_slot, v_stage, v_spaet, v_spaet + interval '30 minutes');
  insert into t_res values ('07b_admin_warnung',
    case when v_res::text like '%after_close%' then 'ok, verschoben mit Warnung'
         else 'FEHLER ' || coalesce(v_res::text, 'null') end);
  delete from role_assignment where person_id = v_pid;
end $$;
select * from t_res order by step;
rollback;
