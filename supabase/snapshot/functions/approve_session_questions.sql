create or replace function approve_session_questions(p_session_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_event uuid; v_n integer;
begin
  select event_id into v_event from session where id = p_session_id;
  if v_event is null then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if not is_programme_editor(v_event) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update session_question set approved_by = current_person_id(), approved_at = now()
   where session_id = p_session_id and approved_at is null;
  get diagnostics v_n = row_count;
  perform log_audit('session.questions.approve', 'session', p_session_id::text, null, jsonb_build_object('approved', v_n));
  return v_n;
end $$;
