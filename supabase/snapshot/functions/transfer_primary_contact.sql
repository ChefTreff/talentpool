create or replace function transfer_primary_contact(p_org_id uuid, p_person_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_current uuid;
begin
  if not partner_can_manage_contacts(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from org_membership where org_id = p_org_id and person_id = p_person_id) then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
  select person_id into v_current from org_membership where org_id = p_org_id and roles @> '{primary_ops}' for update;
  if v_current = p_person_id then return; end if;
  if v_current is not null then
    update org_membership set roles = array_append(array_remove(roles, 'primary_ops'), 'additional') where org_id = p_org_id and person_id = v_current;
  end if;
  update org_membership set roles = array_append(array_remove(roles, 'additional'), 'primary_ops') where org_id = p_org_id and person_id = p_person_id;
  perform log_audit('partner.primary_transfer', 'organization', p_org_id::text, jsonb_build_object('from', v_current), jsonb_build_object('to', p_person_id));
end $$;
