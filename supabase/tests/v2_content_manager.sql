-- Smoke-Test 0037: Speaker-Manager im Scope sieht Einreichungen seiner Speaker (pending_submissions), gibt frei / lehnt ab; ohne Scope 42501; manager_speakers liefert internal_notes.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ed uuid; v_ev uuid; v_day uuid; v_st uuid; v_slot uuid; v_sess uuid; v_sp uuid; v_spk uuid;
  v_sub uuid; v_sub2 uuid; v_sub3 uuid;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  delete from role_assignment where person_id = v_pid; delete from staff_user where auth_user_id = v_uid; -- Testperson ohne Vorrechte (Rollback stellt alles wieder her)
  select id into v_ed from event where is_edition and slug = 'fls27';
  insert into event (name, format_tag, edition_id, slug, timezone) values ('T Summit', 'summit', v_ed, 't9-summit', 'Europe/Berlin') returning id into v_ev;
  insert into event_day (event_id, day_date) values (v_ev, '2027-04-16') returning id into v_day;
  insert into stage (event_id, name, slug, room) values (v_ev, 'Main', 'main', 'Saal 1') returning id into v_st;
  insert into slot (stage_id, event_day_id, start_at, end_at) values (v_st, v_day, '2027-04-16 13:00+02', '2027-04-16 13:30+02') returning id into v_slot;
  insert into session (event_id, slot_id, title_de, title_en, format, access_mode) values (v_ev, v_slot, 'Alter Titel', 'Old title', 'keynote', 'open') returning id into v_sess;
  -- Testperson = Manager mit Editions-Scope (kein Team), Speaker ist eine andere Person
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pid, 'speaker_manager', 'edition', v_ed);
  v_sp := upsert_speaker(jsonb_build_object('edition_id', v_ed, 'email', 'sam-' || gen_random_uuid()::text || '@example.com', 'first_name', 'Sam', 'last_name', 'Speaker', 'pipeline_status', 'confirmed'));
  select person_id into v_spk from speaker_profile where id = v_sp;
  insert into session_speaker (session_id, person_id, role, sort_order) values (v_sess, v_spk, 'speaker', 0);
  insert into session_submission (session_id, speaker_profile_id, title, description, topics, language, status, submitted_by)
  values (v_sess, v_sp, 'New title', 'New description', array['ai'], 'en', 'submitted', v_spk) returning id into v_sub;

  insert into t_res values ('01_manager_cannot_edit_session', (not can_edit_session(v_sess))::text || ' manages_speaker=' || can_manage_speaker(v_sp)::text);
  insert into t_res values ('02_pending_visible', (select count(*)::text from pending_submissions()));
  perform approve_session_content(v_sub, '{}'::jsonb);
  insert into t_res values ('03_approved', (select title_en || ' | ' || coalesce(description_en, '-') from session where id = v_sess) || ' status=' || (select status from session_submission where id = v_sub));
  insert into t_res values ('04_audit', (select count(*)::text from audit_log where action = 'session.content_approved' and object_id = v_sess::text and created_at >= now()));
  insert into session_submission (session_id, speaker_profile_id, title, language, status, submitted_by) values (v_sess, v_sp, 'Second', 'en', 'submitted', v_spk) returning id into v_sub2;
  perform reject_session_content(v_sub2, 'Bitte kürzer');
  insert into t_res values ('05_rejected', (select status || ' note=' || review_note from session_submission where id = v_sub2));
  -- ohne Scope: nichts sehen, nichts entscheiden
  insert into session_submission (session_id, speaker_profile_id, title, language, status, submitted_by) values (v_sess, v_sp, 'Third', 'en', 'submitted', v_spk) returning id into v_sub3;
  delete from role_assignment where person_id = v_pid;
  insert into t_res values ('06_pending_without_scope', (select count(*)::text from pending_submissions()));
  begin
    perform approve_session_content(v_sub3, '{}'::jsonb);
    insert into t_res values ('07_approve_without_scope', 'ALLOWED (BUG)');
  exception when others then insert into t_res values ('07_approve_without_scope', 'rejected ' || sqlstate); end;
  -- manager_speakers liefert die interne Notiz
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pid, 'speaker_manager', 'edition', v_ed);
  perform update_speaker(v_sp, jsonb_build_object('internal_notes', 'Notiz für Leads'));
  insert into t_res values ('08_internal_notes', (select coalesce(internal_notes, '-') || ' email_ok=' || (email is not null)::text from manager_speakers() where id = v_sp));
end $$;
select * from t_res order by step;
rollback;
