create or replace function partner_can_manage_contacts(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select is_partner_team() or 'primary_ops' = any(partner_roles(p_org_id))
$$;
