create or replace function set_contact_roles(p_org_id uuid, p_person_id uuid, p_roles text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_role text; v_old text[];
begin
  if not partner_can_manage_contacts(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_roles is null or cardinality(p_roles) = 0 then raise exception 'roles_required' using errcode = '22023'; end if;
  foreach v_role in array p_roles loop
    if not is_vocab_key('contact_role', v_role) then raise exception 'invalid_role' using errcode = '22023', detail = v_role; end if;
  end loop;
  select roles into v_old from org_membership where org_id = p_org_id and person_id = p_person_id for update;
  if not found then raise exception 'contact_not_found' using errcode = 'P0002'; end if;
  if 'primary_ops' = any(v_old) and not ('primary_ops' = any(p_roles)) then raise exception 'primary_required' using errcode = 'P0001', detail = 'transfer_first'; end if;
  if 'primary_ops' = any(p_roles) and exists (select 1 from org_membership om where om.org_id = p_org_id and om.person_id <> p_person_id and om.roles @> '{primary_ops}') then
    raise exception 'primary_exists' using errcode = 'P0001';
  end if;
  update org_membership set roles = p_roles where org_id = p_org_id and person_id = p_person_id;
  perform log_audit('partner.contact_roles', 'organization', p_org_id::text, jsonb_build_object('person_id', p_person_id, 'roles', to_jsonb(v_old)),
                    jsonb_build_object('person_id', p_person_id, 'roles', to_jsonb(p_roles)));
end $$;
