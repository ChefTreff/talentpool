-- Smoke-Test 0028: Session-Inhalte (eingereicht vs. final), Deadlines, Uploads (late, Versionen), Technik-Check, Slid@Home.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ev uuid; v_day uuid; v_st uuid; v_slot uuid; v_sess uuid; v_sp uuid;
  v_sub uuid; v_json jsonb; v_path text; v_asset1 uuid; v_asset2 uuid; v_err text;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';
  insert into event (name, format_tag, edition_id, slug, timezone) values ('T Summit', 'summit', v_ed, 't3-summit', 'Europe/Berlin') returning id into v_ev;
  insert into event_day (event_id, day_date) values (v_ev, '2027-04-16') returning id into v_day;
  insert into stage (event_id, name, slug, room) values (v_ev, 'Main', 'main', 'Saal 1') returning id into v_st;
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st, v_day, '2027-04-16 13:00+02', '2027-04-16 13:30+02') returning id into v_slot;
  insert into session (event_id, slot_id, title_de, format, access_mode) values (v_ev, v_slot, 'Talk (Arbeitstitel)', 'keynote', 'open') returning id into v_sess;
  -- Testperson wird Speaker dieser Session (Profil via Admin-Bootstrap, danach Rolle wieder weg)
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'admin', 'global');
  v_sp := upsert_speaker(jsonb_build_object('edition_id', v_ed, 'person_id', v_pid, 'speaker_type', 'keynote'));
  delete from role_assignment where person_id = v_pid and role = 'admin';
  insert into session_speaker (session_id, person_id, role, sort_order) values (v_sess, v_pid, 'speaker', 0);

  insert into t_res values ('01_my_sessions', (select count(*)::text || ' room=' || coalesce(max(room), '-') || ' sub=' || coalesce(max(latest_submission::text), 'NULL') from my_sessions()));
  insert into t_res values ('02_deadline_seed', (select count(*)::text || ' due=' || to_char(max(due_at) at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI') from deadline where edition_id = v_ed and key = 'presentation_upload'));
  insert into t_res values ('03_window', (select (presentation_window(v_sess)->>'late_now') || ' eff=' || to_char((presentation_window(v_sess)->>'effective_due')::timestamptz at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI')));

  -- Einreichung (EN) durch den Speaker
  begin
    perform submit_session_content(v_sess, jsonb_build_object('description', 'x'));
    insert into t_res values ('04_submit_without_title', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('04_submit_without_title', 'rejected ' || sqlerrm); end;
  v_sub := submit_session_content(v_sess, jsonb_build_object('title', 'Leading in 2030', 'description', 'Why leadership changes.', 'topics', jsonb_build_array('leadership', 'future'), 'language', 'en'));
  insert into t_res values ('05_submitted', (select status || ' topics=' || array_length(topics, 1)::text from session_submission where id = v_sub));
  insert into t_res values ('06_latest_in_my_sessions', (select latest_submission->>'status' || ' title=' || (latest_submission->>'title') from my_sessions() where session_id = v_sess));
  -- zweite Einreichung ersetzt die erste (superseded)
  perform submit_session_content(v_sess, jsonb_build_object('title', 'Leading in 2030 (v2)', 'language', 'en'));
  insert into t_res values ('07_superseded', (select status from session_submission where id = v_sub));
  select id into v_sub from session_submission where session_id = v_sess and status = 'submitted';

  -- Freigabe: Speaker darf nicht, Programm-Team schon
  begin
    perform approve_session_content(v_sub);
    insert into t_res values ('08_approve_as_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('08_approve_as_speaker', 'rejected ' || sqlstate); end;
  insert into t_res values ('09_pending_without_role', (select count(*)::text from pending_submissions(v_ev)));
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pid, 'programme_team', 'edition', v_ed);
  insert into t_res values ('10_pending_as_team', (select count(*)::text || ' speaker=' || coalesce(max(speaker_name), '-') from pending_submissions(v_ev)));
  perform approve_session_content(v_sub, jsonb_build_object('title_de', 'Führen in 2030'));
  insert into t_res values ('11_final_in_session', (select coalesce(title_en, '-') || ' | ' || coalesce(title_de, '-') || ' | lang=' || coalesce(language, '-') || ' | desc_en=' || coalesce(description_en, '-') from session where id = v_sess));
  insert into t_res values ('12_submission_approved', (select status || ' reviewed=' || (reviewed_by is not null)::text from session_submission where id = v_sub));
  begin
    perform approve_session_content(v_sub);
    insert into t_res values ('13_approve_twice', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('13_approve_twice', 'rejected ' || sqlerrm); end;

  -- Upload: Pfadregel, Objekt muss existieren, Versionen, late
  v_path := v_ed::text || '/' || v_sp::text || '/presentation/talk-v1.pdf';
  insert into t_res values ('14_path_allowed_own', speaker_asset_path_allowed(v_path)::text || ' fremd=' || speaker_asset_path_allowed(v_ed::text || '/' || gen_random_uuid()::text || '/presentation/x.pdf')::text || ' falsch=' || speaker_asset_path_allowed('foo/bar')::text);
  begin
    perform register_speaker_asset(v_sp, 'presentation', v_path, 'talk-v1.pdf', 'application/pdf', 1234, v_sess);
    insert into t_res values ('15_register_without_object', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('15_register_without_object', 'rejected ' || sqlerrm); end;
  insert into storage.objects (bucket_id, name, owner_id, metadata) values ('speaker-assets', v_path, v_uid::text, '{"mimetype": "application/pdf", "size": 1234}'::jsonb);
  v_json := register_speaker_asset(v_sp, 'presentation', v_path, 'talk-v1.pdf', 'application/pdf', 1234, v_sess);
  v_asset1 := (v_json->>'id')::uuid;
  insert into t_res values ('16_registered_v1', 'v' || (v_json->>'version') || ' late=' || (v_json->>'late'));
  insert into storage.objects (bucket_id, name, owner_id, metadata) values ('speaker-assets', v_ed::text || '/' || v_sp::text || '/presentation/talk-v2.pdf', v_uid::text, '{}'::jsonb);
  v_json := register_speaker_asset(v_sp, 'presentation', v_ed::text || '/' || v_sp::text || '/presentation/talk-v2.pdf', 'talk-v2.pdf', 'application/pdf', 2345, v_sess);
  v_asset2 := (v_json->>'id')::uuid;
  insert into t_res values ('17_registered_v2', 'v' || (v_json->>'version') || ' v1_current=' || (select is_current::text from speaker_asset where id = v_asset1) || ' v2_current=' || (select is_current::text from speaker_asset where id = v_asset2));
  -- late: Slot in die Vergangenheit ziehen (nach Deadline) — Upload wird angenommen, aber markiert
  update slot set start_at = now() + interval '1 hour', end_at = now() + interval '2 hours' where id = v_slot;
  insert into storage.objects (bucket_id, name, owner_id, metadata) values ('speaker-assets', v_ed::text || '/' || v_sp::text || '/presentation/talk-v3.pdf', v_uid::text, '{}'::jsonb);
  v_json := register_speaker_asset(v_sp, 'presentation', v_ed::text || '/' || v_sp::text || '/presentation/talk-v3.pdf', 'talk-v3.pdf', 'application/pdf', 3456, v_sess);
  insert into t_res values ('18_late_accepted', 'v' || (v_json->>'version') || ' late=' || (v_json->>'late'));
  begin
    perform register_speaker_asset(v_sp, 'presentation', v_ed::text || '/' || gen_random_uuid()::text || '/presentation/x.pdf', 'x.pdf');
    insert into t_res values ('19_path_mismatch', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('19_path_mismatch', 'rejected ' || sqlerrm); end;

  -- Slid@Home nur mit Consent; Technik-Check nur Team
  begin
    perform set_slides_release(v_asset2, true);
    insert into t_res values ('20_release_without_consent', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('20_release_without_consent', 'rejected ' || sqlerrm); end;
  insert into consent_record (person_id, consent_type, version, granted, source) values (v_pid, 'slides_publication', 'test', true, 'portal');
  perform set_slides_release(v_asset2, true);
  insert into t_res values ('21_release_with_consent', (select slides_release::text from speaker_asset where id = v_asset2));
  delete from role_assignment where person_id = v_pid;
  begin
    perform set_tech_check(v_asset2, 'checked', 'ok');
    insert into t_res values ('22_tech_check_as_speaker', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('22_tech_check_as_speaker', 'rejected ' || sqlstate); end;
  insert into role_assignment (person_id, role, scope_type) values (v_pid, 'production_team', 'global');
  perform set_tech_check(v_asset2, 'checked', 'ok');
  insert into t_res values ('23_tech_check_as_production', (select tech_check_status || ' by=' || (tech_checked_by is not null)::text from speaker_asset where id = v_asset2));
  insert into t_res values ('24_my_assets', (select count(*)::text || ' current=' || count(*) filter (where is_current)::text from my_speaker_assets(v_sp)));
  insert into t_res values ('25_next_steps', (speaker_next_steps(v_sp)->>'open'));
  insert into t_res values ('26_audit', (select count(*)::text from audit_log where action in ('session.submission', 'session.content_approved', 'speaker.asset', 'speaker.slides_release', 'speaker.tech_check')));
end $$;
select * from t_res order by step;
rollback;
