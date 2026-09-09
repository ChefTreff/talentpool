-- Smoke-Test 0009: Bewerbungs-Pipeline, Maskierung, Ticketpflicht, Kollision, Warteliste, Personalisierung.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text;
  v_ed uuid; v_ev uuid; v_day uuid; v_st uuid; v_st2 uuid; v_s1 uuid; v_s2 uuid; v_s3 uuid;
  v_sess_app uuid; v_sess_app2 uuid; v_sess_reg uuid; v_app uuid; v_app2 uuid; v_tid uuid; v_other uuid;
  v_json jsonb; v_detail text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into event (name, format_tag, is_edition, slug) values ('TEST Ed','edition',true,'t-ed') returning id into v_ed;
  insert into event (name, format_tag, edition_id, slug) values ('TEST Summit','summit',v_ed,'t-summit') returning id into v_ev;
  insert into event_day (event_id, day_date) values (v_ev, '2027-04-16') returning id into v_day;
  insert into stage (event_id, name, slug) values (v_ev, 'Side', 'side') returning id into v_st;
  insert into stage (event_id, name, slug) values (v_ev, 'Main', 'main') returning id into v_st2;
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st,  v_day, '2027-04-16 13:00+02', '2027-04-16 14:00+02') returning id into v_s1;
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st2, v_day, '2027-04-16 13:30+02', '2027-04-16 14:30+02') returning id into v_s2;
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st,  v_day, '2027-04-16 15:00+02', '2027-04-16 16:00+02') returning id into v_s3;
  insert into session (event_id, slot_id, title_de, title_en, description_de, format, access_mode, publish_status, eligibility_rule, capacity)
    values (v_ev, v_s1, 'MC A', 'MC A', 'x', 'masterclass', 'application', 'published', '{"u35": true}', 20) returning id into v_sess_app;
  insert into session (event_id, slot_id, title_de, title_en, description_de, format, access_mode, publish_status, capacity)
    values (v_ev, v_s2, 'MC B', 'MC B', 'x', 'masterclass', 'application', 'published', 20) returning id into v_sess_app2;
  insert into session (event_id, slot_id, title_de, title_en, description_de, format, access_mode, publish_status, capacity, ticket_required)
    values (v_ev, v_s3, 'Reception', 'Reception', 'x', 'reception', 'registration', 'published', 1, false) returning id into v_sess_reg;

  begin
    perform apply_to_session(v_sess_app, '{}'::jsonb, false);
    insert into t_res values ('01_apply_u35_no_birthdate', 'ALLOWED');
  exception when others then insert into t_res values ('01_apply_u35_no_birthdate', 'rejected ' || sqlerrm); end;
  update person set birthdate = '1998-05-05' where id = v_pid;
  v_app := apply_to_session(v_sess_app, '{"motivation":"x"}'::jsonb, true);
  insert into t_res values ('02_apply_ok', (v_app is not null)::text);
  begin
    perform apply_to_session(v_sess_app, '{}'::jsonb, false);
    insert into t_res values ('03_apply_duplicate', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('03_apply_duplicate', 'rejected ' || sqlstate); end;
  begin
    perform decide_application(v_app, 'accepted', 1);
    insert into t_res values ('04_decide_without_role', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_decide_without_role', 'rejected ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pid, 'programme_team', 'edition', v_ed);
  perform decide_application(v_app, 'accepted', 1);
  insert into t_res values ('05_masked_before_release', (select status from my_applications() where id = v_app));
  begin
    perform confirm_application(v_app);
    insert into t_res values ('06_confirm_before_release', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('06_confirm_before_release', 'rejected ' || sqlerrm); end;
  insert into t_res values ('07_release_count', release_decisions(v_sess_app)::text);
  insert into t_res values ('08_status_after_release', (select status from my_applications() where id = v_app));
  begin
    perform confirm_application(v_app);
    insert into t_res values ('09_confirm_without_ticket', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('09_confirm_without_ticket', 'rejected ' || sqlerrm); end;
  insert into ticket (event_id, person_id, barcode, status, pass_type) values (v_ev, v_pid, 'TESTBARCODE1', 'valid', 'talent') returning id into v_tid;
  v_json := confirm_application(v_app);
  insert into t_res values ('10_confirm_ok', v_json::text);
  v_app2 := apply_to_session(v_sess_app2, '{}'::jsonb, false);
  perform decide_application(v_app2, 'accepted', 1);
  perform release_decisions(v_sess_app2);
  begin
    perform confirm_application(v_app2);
    insert into t_res values ('11_collision_detected', 'ALLOWED (BUG)');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into t_res values ('11_collision_detected', 'rejected ' || sqlerrm || ' detail=' || coalesce(v_detail, ''));
  end;
  v_json := confirm_application(v_app2, true);
  insert into t_res values ('12_collision_replaced', v_json::text || ' first_now=' || (select status from application where id = v_app));
  insert into t_res values ('13_register_first', register_for_session(v_sess_reg));
  perform cancel_registration(v_sess_reg);
  insert into person (first_name) values ('Dummy') returning id into v_other;
  insert into registration (person_id, event_id, session_id, status, source) values (v_other, v_ev, v_sess_reg, 'confirmed', 'test');
  insert into t_res values ('14_register_waitlisted', register_for_session(v_sess_reg));
  perform cancel_registration(v_sess_reg);
  insert into t_res values ('15_cancel_ok', (select status from registration where person_id = v_pid and session_id = v_sess_reg));
  insert into ticket (event_id, barcode, buyer_email, status) values (v_ev, 'TESTBARCODE2', v_email, 'valid') returning id into v_tid;
  perform personalize_ticket(v_tid, 'Max', 'Muster', 'ACME', 'CTO', false, 'Max@Example.org');
  insert into t_res values ('16_personalize_other', (select personalization_status || ' ' || holder_email::text from ticket where id = v_tid));
  insert into session_question (session_id, label_de, type) values (v_sess_app, 'F1', 'text'), (v_sess_app, 'F2', 'text');
  begin
    insert into session_question (session_id, label_de, type) values (v_sess_app, 'F3', 'text');
    insert into t_res values ('17_custom_question_limit', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('17_custom_question_limit', 'rejected ' || sqlstate); end;
  insert into t_res values ('18_audit_rows', (select count(*)::text from audit_log where action like 'application.%' or action = 'ticket.personalize'));
end $$;
select * from t_res order by step;
rollback;
