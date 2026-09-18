create or replace function detach_session(p_session_id uuid)
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
  if not can_edit_session(p_session_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_s.publish_status = 'published' then
    raise exception 'unpublish_first' using errcode = 'P0001';
  end if;
  update session set slot_id = null, updated_by = current_person_id() where id = p_session_id;
  if v_s.slot_id is not null then
    insert into slot_history (slot_id, changed_by, action, before)
      values (v_s.slot_id, current_person_id(), 'detach', jsonb_build_object('session_id', p_session_id));
  end if;
  perform log_audit('session.detach', 'session', p_session_id::text, jsonb_build_object('slot_id', v_s.slot_id), null);
end $$;
