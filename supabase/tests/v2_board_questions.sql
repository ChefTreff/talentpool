-- Smoke-Test 0016/0017: Realtime-Policies und Trigger vorhanden, Programmzeiten, Fragen-RPCs.
-- Hinweis: realtime.send() schreibt nur, wenn der Realtime-Dienst Partitionen angelegt hat
-- (nach erstem verbundenen Client). 0 msg(s) ist daher auf einem frischen Projekt normal.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare
  v_pid uuid; v_uid uuid; v_email text; v_ev uuid; v_sess uuid; v_q uuid; v_n integer; v_before bigint; v_after bigint;
begin
  select p.id, p.auth_user_id, pe.email::text into v_pid, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary where p.auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);
  select id into v_ev from event where slug = 'summit-27';
  insert into role_assignment (person_id, role, scope_type, edition_id) values (v_pid, 'programme_team', 'edition', (select edition_id from event where id = v_ev)) on conflict do nothing;

  insert into t_res values ('01_policies_realtime_messages', (select count(*)::text from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname like 'programme_board_%'));
  insert into t_res values ('02_triggers', (select string_agg(tgname, ',' order by tgname) from pg_trigger where tgname like 'trg_%board_notify'));
  insert into t_res values ('03_day_times', (select string_agg(day_date::text || ' ' || programme_start::text || '-' || programme_end::text, ' | ' order by day_date) from event_day where event_id = v_ev));
  select count(*) into v_before from realtime.messages;
  v_sess := upsert_session(jsonb_build_object('event_id', v_ev, 'title_de', 'RT Test', 'format', 'keynote'));
  select count(*) into v_after from realtime.messages;
  insert into t_res values ('04_realtime_send_on_session_insert', (v_after - v_before)::text || ' msg(s)');
  select id into v_q from question_catalog where key = 'motivation';
  v_n := set_session_questions(v_sess, jsonb_build_array(jsonb_build_object('question_id', v_q, 'required', true), jsonb_build_object('label_de', 'Eigene Frage', 'type', 'text')));
  insert into t_res values ('05_set_questions', v_n::text || ' rows; approved=' || (select count(*)::text from session_question where session_id = v_sess and approved_at is not null));
  v_n := set_session_questions(v_sess, jsonb_build_array(jsonb_build_object('question_id', v_q, 'required', false)));
  insert into t_res values ('06_replace_catalog_keeps_custom', (select count(*)::text || ' total, custom=' || count(*) filter (where question_id is null)::text from session_question where session_id = v_sess));
  v_n := set_session_questions(v_sess, '[]'::jsonb, true);
  insert into t_res values ('07_replace_all', (select count(*)::text from session_question where session_id = v_sess));
end $$;
select * from t_res order by step;
rollback;
