create or replace function is_member_of_org(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (select 1 from org_membership om
                 where om.org_id = p_org_id and om.person_id = current_person_id())
      or has_role('partner_contact', 'org', p_org_id)
$$;
