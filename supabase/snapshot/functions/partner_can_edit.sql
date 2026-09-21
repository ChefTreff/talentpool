create or replace function partner_can_edit(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select is_partner_team() or partner_roles(p_org_id) && '{primary_ops,additional,signing}'::text[]
$$;
