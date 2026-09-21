create or replace function unpublish_session(p_session_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_s session%rowtype;
begin
  select * into v_s from session where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if not is_programme_editor(v_s.event_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update session set publish_status = 'draft', updated_by = current_person_id() where id = p_session_id;
  perform log_audit('session.unpublish', 'session', p_session_id::text, jsonb_build_object('publish_status', v_s.publish_status), jsonb_build_object('publish_status', 'draft', 'reason', p_reason));
end $$;
