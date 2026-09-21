create or replace function set_org_contacts(p_org_edition_id uuid, p_lead uuid, p_buddy uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not can_edit_edition_contacts() then raise exception 'not allowed' using errcode = '42501'; end if;
  select oe.edition_id into v_ed from org_edition oe where oe.id = p_org_edition_id;
  if v_ed is null then raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_edition_id::text; end if;
  perform check_edition_contact(p_lead, v_ed, 'partner_lead');
  perform check_edition_contact(p_buddy, v_ed, 'partner_buddy');
  update org_edition set lead_contact_id = p_lead, buddy_contact_id = p_buddy, updated_at = now()
   where id = p_org_edition_id;
  perform log_audit('edition_contact.assign_org', 'org_edition', p_org_edition_id::text, null,
                    jsonb_build_object('lead', p_lead, 'buddy', p_buddy));
end $$;
