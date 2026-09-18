create or replace function set_slot_status(p_slot_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_old text;
begin
  if not can_edit_slot(p_slot_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from vocab_term where vocabulary = 'slot_status' and key = p_status and active) then
    raise exception 'unknown slot status %', p_status using errcode = '22023';
  end if;
  select status into v_old from slot where id = p_slot_id for update;
  update slot set status = p_status, updated_by = current_person_id() where id = p_slot_id;
  insert into slot_history (slot_id, changed_by, action, before, after)
    values (p_slot_id, current_person_id(), 'status',
            jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
end $$;
