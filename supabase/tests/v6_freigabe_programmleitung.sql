-- Smoke-Test zum Vorschlag v6_freigabe_programmleitung (LEAD-022). Belegt mit
-- einem **reinen** Programm-Team-Konto:
--   01 die Programmleitung sieht die wartende Partner-Session (vorher 42501);
--   02 sie gibt frei — Session `published`, Slot `final`;
--   03 sie gibt mit Grund zurück — Session `draft`, Slot `requested`;
--   04 ohne Grund zurückgeben wird abgewiesen (22023 fields_required);
--   05 ohne Rolle 42501 auf der Liste;
--   06 Programm-Team **einer anderen Edition** darf nicht freigeben.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_ev uuid; v_ed uuid; v_tz text; v_day event_day%rowtype; v_stage uuid;
  v_org uuid; v_slot uuid; v_se uuid; v_start timestamptz; v_n integer; v_st text; v_sl text; v_ed2 uuid;
begin
  select p.id, p.auth_user_id into v_pid, v_uid from person p where p.auth_user_id is not null limit 1;
  delete from role_assignment where person_id = v_pid;

  select ev.id, coalesce(ev.edition_id, ev.id), ev.timezone into v_ev, v_ed, v_tz
    from event ev where exists (select 1 from event_day ed where ed.event_id = ev.id) order by ev.start_date limit 1;
  select ed.* into v_day from event_day ed where ed.event_id = v_ev order by ed.day_date limit 1;
  v_start := (v_day.day_date + time '14:00') at time zone v_tz;

  -- Eine Standbühne mit wartender Session, vollständig für die Freigabe.
  insert into organization (communication_name) values ('Freigabe Testpartner') returning id into v_org;
  insert into stage (event_id, name, slug, type, partner_org_id)
  values (v_ev, 'Standbühne Test', 'stand-test-' || substr(gen_random_uuid()::text, 1, 6), 'partner_booth', v_org)
  returning id into v_stage;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status)
  values (v_stage, v_day.id, v_start, v_start + interval '30 minutes', 'content', 'requested') returning id into v_slot;
  insert into session (event_id, slot_id, format, title_de, title_en, description_de, partner_org_id, host_org_id, publish_status)
  values (v_ev, v_slot, 'talk', 'Freigabe Probe', 'Release probe', 'Beschreibung', v_org, v_org, 'review')
  returning id into v_se;

  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'programme_team', 'global');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- 01 · sieht sie
  select count(*) into v_n from partner_sessions_pending(v_ev) where session_id = v_se;
  insert into t_res values ('01_sieht_wartende', case when v_n = 1 then 'ok' else 'FEHLER ' || v_n end);

  -- 02 · freigeben
  perform release_partner_session(v_se, true, null);
  select se.publish_status, sl.status into v_st, v_sl from session se join slot sl on sl.id = se.slot_id where se.id = v_se;
  insert into t_res values ('02_freigegeben', case when v_st = 'published' and v_sl = 'final' then 'ok' else 'FEHLER ' || v_st || '/' || v_sl end);

  -- 03 · mit Grund zurück
  update session set publish_status = 'review' where id = v_se;
  perform release_partner_session(v_se, false, 'Bitte den englischen Titel schärfen.');
  select se.publish_status, sl.status into v_st, v_sl from session se join slot sl on sl.id = se.slot_id where se.id = v_se;
  insert into t_res values ('03_zurueckgegeben', case when v_st = 'draft' and v_sl = 'requested' then 'ok' else 'FEHLER ' || v_st || '/' || v_sl end);

  -- 04 · ohne Grund
  update session set publish_status = 'review' where id = v_se;
  begin
    perform release_partner_session(v_se, false, '  ');
    insert into t_res values ('04_ohne_grund', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('04_ohne_grund', 'abgewiesen ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 05 · ohne Rolle
  delete from role_assignment where person_id = v_pid;
  begin
    perform partner_sessions_pending(v_ev);
    insert into t_res values ('05_ohne_rolle', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('05_ohne_rolle', 'abgewiesen ' || sqlstate);
  end;

  -- 06 · Programm-Team einer anderen Edition
  insert into event (name, slug, is_edition, format_tag)
  select 'Andere Edition', 'andere-ed-' || substr(gen_random_uuid()::text, 1, 6), true, e.format_tag from event e where e.id = v_ev
  returning id into v_ed2;
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pid, 'programme_team', 'edition', v_ed2);
  begin
    perform release_partner_session(v_se, true, null);
    insert into t_res values ('06_fremde_edition', 'ERLAUBT (BUG)');
  exception when others then
    insert into t_res values ('06_fremde_edition', 'abgewiesen ' || sqlstate);
  end;
  delete from role_assignment where person_id = v_pid;
end $$;
select * from t_res order by step;
rollback;
