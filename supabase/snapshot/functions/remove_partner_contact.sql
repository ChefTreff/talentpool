create or replace function remove_partner_contact(p_org_id uuid, p_person_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_roles text[];
begin
  if not partner_can_manage_contacts(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  select roles into v_roles from org_membership where org_id = p_org_id and person_id = p_person_id for update;
  if not found then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
  if 'primary_ops' = any(v_roles) then raise exception 'primary_required' using errcode = 'P0001', detail = 'transfer_first'; end if;
  delete from org_membership where org_id = p_org_id and person_id = p_person_id;
  delete from role_assignment where person_id = p_person_id and role = 'partner_contact' and scope_type = 'org' and scope_id = p_org_id;
  perform log_audit('partner.contact_removed', 'organization', p_org_id::text, jsonb_build_object('person_id', p_person_id, 'roles', to_jsonb(v_roles)), null);
end $$;
