create or replace function is_standbuehne_editor_of(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(p_org_id is not null and exists (
    select 1 from active_roles() ra
     where ra.role = 'standbuehne_editor' and ra.scope_type = 'org' and ra.scope_id = p_org_id), false)
$$;
