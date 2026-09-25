create or replace function partner_request_publish(p_session_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_stage stage; v_fehlt text[];
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select st.* into v_stage from slot sl join stage st on st.id = sl.stage_id where sl.id = v_se.slot_id;
  -- Nur Sessions auf der eigenen Standbühne, mit dem Recht des Boards auf diesen Slot.
  if v_stage.id is null or v_stage.type <> 'partner_booth' or v_stage.partner_org_id is null
     or not coalesce(can_edit_slot(v_se.slot_id), false)
     or (v_se.host_org_id is not null and v_se.host_org_id <> v_stage.partner_org_id)
     or (v_se.partner_org_id is not null and v_se.partner_org_id <> v_stage.partner_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_se.publish_status in ('review', 'published') then return v_se.publish_status; end if;
  if v_se.publish_status <> 'draft' then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_se.publish_status;
  end if;
  -- Dieselben Bedingungen wie bei der Freigabe (`release_partner_session`) — vorher, mit Namen.
  v_fehlt := array_remove(array[
    case when nullif(btrim(coalesce(v_se.title_de, '')), '') is null then 'title_de' end,
    case when nullif(btrim(coalesce(v_se.title_en, '')), '') is null then 'title_en' end,
    case when coalesce(nullif(btrim(coalesce(v_se.description_de, '')), ''),
                       nullif(btrim(coalesce(v_se.description_en, '')), '')) is null
         then 'description_de|description_en' end
  ], null);
  if cardinality(v_fehlt) > 0 then
    raise exception 'fields_required' using errcode = '22023', detail = array_to_string(v_fehlt, ', ');
  end if;
  update session
     set publish_status = 'review',
         -- Ohne Partner an der Session fände die Freigabeliste sie nicht (`partner_sessions_pending`).
         partner_org_id = coalesce(partner_org_id, v_stage.partner_org_id),
         updated_by = current_person_id()
   where id = p_session_id;
  perform log_audit('partner.session_publish_requested', 'session', p_session_id::text,
                    jsonb_build_object('publish_status', v_se.publish_status),
                    jsonb_build_object('publish_status', 'review', 'org_id', v_stage.partner_org_id));
  return 'review';
end $$;
