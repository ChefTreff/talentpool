-- Smoke-Test 0015: Programm-Editor (Backlog, Scope über Bühne, Veröffentlichungsregeln, Detach-Sperre).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text;
  v_ed uuid; v_ev uuid; v_day uuid; v_st uuid; v_st2 uuid; v_s1 uuid; v_s2 uuid; v_sess uuid; v_other uuid; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Admin-Bootstrap kommt per Rollback zurueck)
  insert into event (name, format_tag, is_edition, slug) values ('T Ed','edition',true,'t2-ed') returning id into v_ed;
  insert into event (name, format_tag, edition_id, slug) values ('T Summit','summit',v_ed,'t2-summit') returning id into v_ev;
  insert into event_day (event_id, day_date) values (v_ev, '2027-04-16') returning id into v_day;
  insert into stage (event_id, name, slug) values (v_ev, 'Side', 'side') returning id into v_st;
  insert into stage (event_id, name, slug) values (v_ev, 'Main', 'main') returning id into v_st2;
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st,  v_day, '2027-04-16 13:00+02', '2027-04-16 13:30+02') returning id into v_s1;
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st2, v_day, '2027-04-16 13:00+02', '2027-04-16 13:30+02') returning id into v_s2;
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_pid, 'speaker_manager', 'stage', v_st, v_ed);
  insert into person (first_name, last_name) values ('Test', 'Speaker') returning id into v_other;

  v_sess := upsert_session(jsonb_build_object('event_id', v_ev, 'title_de', 'Talk A', 'format', 'keynote', 'access_mode', 'open'));
  insert into t_res values ('01_create_backlog', (v_sess is not null)::text);
  insert into t_res values ('02_backlog_visible_can_edit', (select can_edit::text from programme_backlog where session_id = v_sess));
  begin
    perform attach_session_to_slot(v_sess, v_s2);
    insert into t_res values ('03_attach_other_stage', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_attach_other_stage', 'rejected ' || sqlstate); end;
  perform attach_session_to_slot(v_sess, v_s1);
  insert into t_res values ('04_attach_own_stage', (select (slot_id = v_s1)::text from session where id = v_sess));
  v_n := set_session_speakers(v_sess, jsonb_build_array(jsonb_build_object('person_id', v_other, 'role', 'speaker')));
  insert into t_res values ('05_speakers_set', v_n::text);
  insert into t_res values ('06_board_row', (select title_de || ' | can_edit=' || can_edit::text || ' | speakers=' || jsonb_array_length(speakers)::text from programme_board where slot_id = v_s1));
  begin
    perform publish_session(v_sess);
    insert into t_res values ('07_publish_as_manager', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('07_publish_as_manager', 'rejected ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pid, 'programme_team', 'edition', v_ed);
  begin
    perform publish_session(v_sess);
    insert into t_res values ('08_publish_incomplete', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('08_publish_incomplete', 'rejected ' || sqlstate); end;
  perform upsert_session(jsonb_build_object('id', v_sess, 'title_en', 'Talk A EN', 'description_de', 'Beschreibung'));
  perform publish_session(v_sess);
  insert into t_res values ('09_publish_ok', (select publish_status || ' slot=' || (select status from slot where id = v_s1) from session where id = v_sess));
  begin
    perform detach_session(v_sess);
    insert into t_res values ('10_detach_published', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('10_detach_published', 'rejected ' || sqlerrm); end;
  perform unpublish_session(v_sess, 'test');
  perform detach_session(v_sess);
  insert into t_res values ('11_detach_after_unpublish', (select (slot_id is null)::text from session where id = v_sess));
  insert into t_res values ('12_audit_rows', (select count(*)::text from audit_log where object_id = v_sess::text));
  insert into t_res values ('13_history_rows', (select count(*)::text from slot_history where slot_id = v_s1));
end $$;
select * from t_res order by step;
rollback;
