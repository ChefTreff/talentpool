create or replace function reject_session_content(p_submission_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_s session_submission%rowtype;
begin
  select * into v_s from session_submission where id = p_submission_id for update;
  if not found then raise exception 'submission_not_found' using errcode = 'P0002'; end if;
  if not (can_edit_session(v_s.session_id) or can_manage_speaker(v_s.speaker_profile_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_s.status <> 'submitted' then raise exception 'not_pending' using errcode = 'P0001', detail = v_s.status; end if;
  update session_submission set status = 'rejected', reviewed_by = current_person_id(), reviewed_at = now(), review_note = nullif(btrim(p_note), '')
   where id = p_submission_id;
  perform log_audit('session.content_rejected', 'session', v_s.session_id::text, null, jsonb_build_object('submission_id', p_submission_id, 'note', p_note));
end $$;
