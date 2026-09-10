-- Smoke-Test 0035: Präsentations-Erinnerung (Vorlauf je Deadline, einmal je Speaker × Session, nur mit Slot in der Zukunft, ohne aktuelle Präsentation, nicht bei Absage) und my_manager_scope().
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ev uuid; v_day uuid; v_day2 uuid; v_st uuid; v_slot uuid; v_sess uuid; v_sp uuid;
  v_slot2 uuid; v_sess2 uuid; v_slot3 uuid; v_sess3 uuid; v_slot4 uuid; v_sess4 uuid; v_json jsonb; v_path text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';
  insert into event (name, format_tag, edition_id, slug, timezone) values ('T Summit', 'summit', v_ed, 't8-summit', 'Europe/Berlin') returning id into v_ev;
  insert into event_day (event_id, day_date) values (v_ev, '2027-04-16') returning id into v_day;
  insert into stage (event_id, name, slug, room) values (v_ev, 'Main', 'main', 'Saal 1') returning id into v_st;
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st, v_day, '2027-04-16 13:00+02', '2027-04-16 13:30+02') returning id into v_slot;
  insert into session (event_id, slot_id, title_de, title_en, format, access_mode) values (v_ev, v_slot, 'Vortrag', 'Talk', 'keynote', 'open') returning id into v_sess;
  -- Testperson wird bestätigter Speaker (Admin-Bootstrap; Rolle bleibt zunächst für upsert_deadline)
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  v_sp := upsert_speaker(jsonb_build_object('edition_id', v_ed, 'person_id', v_pid, 'speaker_type', 'keynote', 'pipeline_status', 'confirmed'));
  insert into session_speaker (session_id, person_id, role, sort_order) values (v_sess, v_pid, 'speaker', 0);

  insert into t_res values ('01_far_future', send_presentation_reminders()::text);
  perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', 'presentation_upload', 'audience', 'speaker', 'due_at', (now() + interval '47 hours')::text,
                                             'label_de', 'Präsentation hochladen', 'label_en', 'Upload your presentation'));
  insert into t_res values ('02_lead_kept_default', (select reminder_lead_hours::text from deadline where edition_id = v_ed and key = 'presentation_upload'));
  v_n := send_presentation_reminders(); -- getrennt zählen: im selben Statement sähe die Unterabfrage den alten Snapshot
  insert into t_res values ('03_reminder_sent', v_n::text || ' mail=' || (select count(*)::text from mail_log where template_key = 'presentation_reminder' and related_id = v_sess and person_id = v_pid));
  insert into t_res values ('04_vars', (select (meta->'vars'->>'session_title') || ' | ' || (meta->'vars'->>'due_label') || ' | ' || (meta->'vars'->>'stage_name') || ' | locale=' || locale || ' status=' || status
                                          from mail_log where template_key = 'presentation_reminder' and related_id = v_sess order by id desc limit 1));
  insert into t_res values ('05_once', send_presentation_reminders()::text);

  -- zweite Session, aktuelle Präsentation vorhanden ⇒ keine Erinnerung
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st, v_day, '2027-04-16 14:00+02', '2027-04-16 14:30+02') returning id into v_slot2;
  insert into session (event_id, slot_id, title_de, format, access_mode) values (v_ev, v_slot2, 'Zweiter Vortrag', 'keynote', 'open') returning id into v_sess2;
  insert into session_speaker (session_id, person_id, role, sort_order) values (v_sess2, v_pid, 'speaker', 0);
  v_path := v_ed::text || '/' || v_sp::text || '/presentation/talk.pdf';
  insert into storage.objects (bucket_id, name, owner_id, metadata) values ('speaker-assets', v_path, v_uid::text, '{}'::jsonb);
  perform register_speaker_asset(v_sp, 'presentation', v_path, 'talk.pdf', 'application/pdf', 1000, v_sess2);
  insert into t_res values ('06_has_presentation', send_presentation_reminders()::text);
  -- dritte Session abgesagt ⇒ nichts
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st, v_day, '2027-04-16 15:00+02', '2027-04-16 15:30+02') returning id into v_slot3;
  insert into session (event_id, slot_id, title_de, format, access_mode, publish_status) values (v_ev, v_slot3, 'Abgesagt', 'keynote', 'open', 'cancelled') returning id into v_sess3;
  insert into session_speaker (session_id, person_id, role, sort_order) values (v_sess3, v_pid, 'speaker', 0);
  insert into t_res values ('07_cancelled_session', send_presentation_reminders()::text);
  -- vierte Session, Slot vorbei ⇒ nichts
  insert into event_day (event_id, day_date) values (v_ev, (now() - interval '2 hours')::date) returning id into v_day2;
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st, v_day2, now() - interval '2 hours', now() - interval '1 hour') returning id into v_slot4;
  insert into session (event_id, slot_id, title_de, format, access_mode) values (v_ev, v_slot4, 'Vorbei', 'keynote', 'open') returning id into v_sess4;
  insert into session_speaker (session_id, person_id, role, sort_order) values (v_sess4, v_pid, 'speaker', 0);
  insert into t_res values ('08_past_slot', send_presentation_reminders()::text);
  insert into t_res values ('09_housekeeping_key', (run_application_housekeeping() ? 'reminders')::text);

  -- Vorlauf pflegen: Schlüssel setzt, fehlender Schlüssel lässt stehen, Bereich geprüft
  perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', 'presentation_upload', 'audience', 'speaker', 'due_at', (now() + interval '47 hours')::text,
                                             'label_de', 'x', 'label_en', 'x', 'reminder_lead_hours', 0));
  insert into t_res values ('10_lead_set_zero', (select reminder_lead_hours::text from deadline where edition_id = v_ed and key = 'presentation_upload'));
  perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', 'presentation_upload', 'audience', 'speaker', 'due_at', (now() + interval '47 hours')::text, 'label_de', 'y', 'label_en', 'y'));
  insert into t_res values ('11_lead_kept_without_key', (select reminder_lead_hours::text || ' label=' || label_de from deadline where edition_id = v_ed and key = 'presentation_upload'));
  begin
    perform upsert_deadline(jsonb_build_object('edition_id', v_ed, 'key', 'presentation_upload', 'audience', 'speaker', 'due_at', (now() + interval '47 hours')::text, 'label_de', 'x', 'label_en', 'x', 'reminder_lead_hours', 9999));
    insert into t_res values ('12_lead_out_of_range', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('12_lead_out_of_range', 'rejected ' || sqlstate); end;

  -- my_manager_scope: Team, niemand, Manager mit Bühnen- und Slot-Scope
  v_json := my_manager_scope();
  insert into t_res values ('13_scope_team', 'team=' || (v_json->>'team') || ' all=' || (v_json->>'all') || ' is_manager=' || (v_json->>'is_manager'));
  delete from role_assignment where person_id = v_pid and role = 'admin';
  v_json := my_manager_scope();
  insert into t_res values ('14_scope_none', 'team=' || (v_json->>'team') || ' is_manager=' || (v_json->>'is_manager') || ' stages=' || jsonb_array_length(v_json->'stages')::text || ' owned=' || (v_json->>'owned_profiles'));
  begin
    perform send_presentation_reminders();
    insert into t_res values ('15_reminders_as_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('15_reminders_as_speaker', 'rejected ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_pid, 'speaker_manager', 'stage', v_st, v_ed);
  insert into role_assignment (person_id, role, scope_type, scope_id, edition_id) values (v_pid, 'speaker_manager', 'slot', v_slot, v_ed);
  v_json := my_manager_scope();
  insert into t_res values ('16_scope_manager', 'is_manager=' || (v_json->>'is_manager') || ' all=' || (v_json->>'all') || ' stage=' || (v_json->'stages'->0->>'name') || ' stage_edition_ok=' || ((v_json->'stages'->0->>'edition_id')::uuid = v_ed)::text
                                                 || ' slots=' || jsonb_array_length(v_json->'slots')::text || ' slot_session_ok=' || ((v_json->'slots'->0->>'session_id')::uuid = v_sess)::text || ' editions=' || jsonb_array_length(v_json->'editions')::text);
  insert into t_res values ('17_audit', (select count(*)::text from audit_log where action = 'presentation.reminder' and created_at >= now()));
end $$;
select * from t_res order by step;
rollback;
