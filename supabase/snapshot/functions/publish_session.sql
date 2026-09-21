create or replace function publish_session(p_session_id uuid)
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
  if v_s.format not in ('break','opening','closing','networking','reception','side_event')
     and not exists (select 1 from session_speaker where session_id = p_session_id) then
    raise exception 'publish requires at least one speaker' using errcode = '23514';
  end if;
  update session set publish_status = 'published', updated_by = current_person_id() where id = p_session_id;
  update slot set status = 'final', updated_by = current_person_id()
   where id = v_s.slot_id and status <> 'final';
  perform log_audit('session.publish', 'session', p_session_id::text, jsonb_build_object('publish_status', v_s.publish_status), jsonb_build_object('publish_status', 'published'));
end $$;
