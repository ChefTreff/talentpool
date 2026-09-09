-- Smoke-Test 0006/0007: Scopes, Überlappung, Warnungen, Veröffentlichung, Bestätigungspflicht.
-- Läuft als Transaktion mit Rollback; erwartet: keine Zeile mit "ALLOWED (BUG)".
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_ed uuid; v_ev uuid; v_day uuid; v_st1 uuid; v_st2 uuid;
  v_s1 uuid; v_s2 uuid; v_sess uuid; v_json jsonb;
begin
  select id, auth_user_id into v_pid, v_uid from person where auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Admin-Bootstrap kommt per Rollback zurueck)
  insert into event (name, format_tag, is_edition, slug) values ('TEST Edition', 'edition', true, 'test-ed') returning id into v_ed;
  insert into event (name, format_tag, edition_id, slug, start_date, end_date) values ('TEST Summit', 'summit', v_ed, 'test-summit', '2027-04-16', '2027-04-17') returning id into v_ev;
  insert into event_day (event_id, day_date, label_de) values (v_ev, '2027-04-16', 'Freitag') returning id into v_day;
  insert into stage (event_id, name, slug, type, changeover_min) values (v_ev, 'Main Stage', 'main', 'main', 0) returning id into v_st1;
  insert into stage (event_id, name, slug, type, changeover_min) values (v_ev, 'Side Stage', 'side', 'side', 5) returning id into v_st2;
  insert into stage_day (stage_id, event_day_id, open_from, open_to, slot_quota) values (v_st2, v_day, '13:00', '18:00', 10);
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_pid, 'speaker_manager', 'stage', v_st2, v_ed);

  v_s1 := create_slot(v_st2, '2027-04-16 13:00+02', '2027-04-16 13:30+02');
  insert into t_res values ('create_own_stage', (v_s1 is not null)::text);
  begin
    perform create_slot(v_st1, '2027-04-16 13:00+02', '2027-04-16 13:30+02');
    insert into t_res values ('create_other_stage', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('create_other_stage', 'rejected ' || sqlstate); end;
  begin
    perform create_slot(v_st2, '2027-04-16 13:15+02', '2027-04-16 13:45+02');
    insert into t_res values ('overlap_same_stage', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('overlap_same_stage', 'rejected ' || sqlstate); end;
  v_s2 := create_slot(v_st2, '2027-04-16 14:00+02', '2027-04-16 14:30+02');
  v_json := move_slot(v_s2, v_st2, '2027-04-16 12:57+02', '2027-04-16 13:00+02');
  insert into t_res values ('move_warnings', v_json::text);
  insert into session (event_id, slot_id, title_de, format) values (v_ev, v_s1, 'Test Talk', 'keynote') returning id into v_sess;
  begin
    update session set publish_status = 'published' where id = v_sess;
    insert into t_res values ('publish_incomplete', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('publish_incomplete', 'rejected ' || sqlstate); end;
  update session set title_en = 'Test Talk EN', description_de = 'Beschreibung', publish_status = 'published' where id = v_sess;
  begin
    perform move_slot(v_s1, v_st2, '2027-04-16 15:00+02', '2027-04-16 15:30+02');
    insert into t_res values ('move_published_noconfirm', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('move_published_noconfirm', 'rejected ' || sqlerrm); end;
  v_json := move_slot(v_s1, v_st2, '2027-04-16 15:00+02', '2027-04-16 15:30+02', true);
  insert into t_res values ('move_published_confirm', v_json::text);
  insert into t_res values ('history_rows', (select count(*)::text from slot_history where slot_id in (v_s1, v_s2)));
  insert into t_res values ('stats', (select row_to_json(s)::text from stage_day_slot_stats s where s.stage_id = v_st2));
  insert into t_res values ('programme_public_rows', (select count(*)::text from programme_public where event_id = v_ev));
  insert into t_res values ('can_edit_slot_own', can_edit_slot(v_s1)::text);
end $$;
select * from t_res order by step;
rollback;
