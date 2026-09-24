create or replace function set_session_partner(p_session_id uuid, p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session%rowtype; v_ed uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if not coalesce(can_edit_session(p_session_id) and can_search_board(v_se.event_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_org_id is not null then
    select coalesce(ev.edition_id, ev.id) into v_ed from event ev where ev.id = v_se.event_id;
    if not exists (select 1 from org_edition oe where oe.org_id = p_org_id and oe.edition_id = v_ed) then
      raise exception 'partner_not_in_edition' using errcode = '22023';
    end if;
    if v_se.host_org_id is not null and v_se.host_org_id <> p_org_id then
      raise exception 'partner_host_mismatch' using errcode = '22023';
    end if;
  end if;

  update session set partner_org_id = p_org_id, updated_by = current_person_id()
   where id = p_session_id;
  perform log_audit('programme.session_partner', 'session', p_session_id::text,
                    jsonb_build_object('partner_org_id', v_se.partner_org_id),
                    jsonb_build_object('partner_org_id', p_org_id));
end $$;
