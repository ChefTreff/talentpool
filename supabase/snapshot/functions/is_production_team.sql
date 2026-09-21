create or replace function is_production_team()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select has_role('admin') or has_role('production_team')
      or has_role('area_lead_production')
$$;
