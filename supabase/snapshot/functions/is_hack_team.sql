create or replace function is_hack_team()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  -- Vorher: has_role('admin') or has_role('area_lead_hackathon') — ohne hackathon_team.
  select coalesce(has_admin_section('hackathon'), false)
$$;
