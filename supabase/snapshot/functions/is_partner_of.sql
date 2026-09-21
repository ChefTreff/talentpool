create or replace function is_partner_of(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select cardinality(partner_roles(p_org_id)) > 0
$$;
