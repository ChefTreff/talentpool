create or replace function attach_session_to_slot(p_session_id uuid, p_slot_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_s session%rowtype; v_sl slot%rowtype;
begin
  select * into v_s from session where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  select * into v_sl from slot where id = p_slot_id for update;
  if not found then
    raise exception 'slot_not_found' using errcode = 'P0002';
  end if;
  if not (can_edit_session(p_session_id) and can_edit_slot(p_slot_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from stage st where st.id = v_sl.stage_id and st.event_id <> v_s.event_id) then
    raise exception 'slot belongs to another event' using errcode = '22023';
  end if;
  if exists (select 1 from session o where o.slot_id = p_slot_id and o.id <> p_session_id) then
    raise exception 'slot_occupied' using errcode = '23505';
  end if;
  update session set slot_id = p_slot_id, updated_by = current_person_id() where id = p_session_id;
  insert into slot_history (slot_id, changed_by, action, after)
    values (p_slot_id, current_person_id(), 'attach', jsonb_build_object('session_id', p_session_id));
  perform log_audit('session.attach', 'session', p_session_id::text, jsonb_build_object('slot_id', v_s.slot_id), jsonb_build_object('slot_id', p_slot_id));
end $$;
