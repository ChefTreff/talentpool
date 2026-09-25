create or replace function partner_withdraw_publish(p_session_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_stage stage;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select st.* into v_stage from slot sl join stage st on st.id = sl.stage_id where sl.id = v_se.slot_id;
  if v_stage.id is null or v_stage.type <> 'partner_booth' or v_stage.partner_org_id is null
     or not coalesce(can_edit_slot(v_se.slot_id), false)
     or (v_se.partner_org_id is not null and v_se.partner_org_id <> v_stage.partner_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_se.publish_status <> 'review' then return v_se.publish_status; end if;
  update session set publish_status = 'draft', updated_by = current_person_id() where id = p_session_id;
  perform log_audit('partner.session_publish_withdrawn', 'session', p_session_id::text,
                    jsonb_build_object('publish_status', 'review'), jsonb_build_object('publish_status', 'draft'));
  return 'draft';
end $$;
