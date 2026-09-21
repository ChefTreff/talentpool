create or replace function partner_roles(p_org_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce((select om.roles from org_membership om
                   where om.org_id = p_org_id and om.person_id = current_person_id()
                     and has_role('partner_contact', 'org', p_org_id)), '{}'::text[])
$$;
