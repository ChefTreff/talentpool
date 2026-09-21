create or replace function partner_delete_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if v_se.partner_org_id is null or not partner_can_edit(v_se.partner_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_se.format not in ('side_event', 'interview_table') then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_se.format;
  end if;
  -- Wer zugesagt hat, hat sich den Termin eingetragen. Ab da ist es keine Planung mehr.
  select count(*)::integer into v_n from application a
   where a.session_id = p_session_id and a.status in ('accepted', 'confirmed');
  if v_n > 0 then raise exception 'slot_locked' using errcode = 'P0001', detail = v_n::text; end if;

  update session set publish_status = 'cancelled', updated_by = current_person_id() where id = p_session_id;
  delete from slot where id = v_se.slot_id;
  perform log_audit('partner.session_delete', 'session', p_session_id::text,
                    jsonb_build_object('format', v_se.format), null);
end $$;
