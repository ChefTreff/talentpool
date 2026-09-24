create or replace function can_view_community_events()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(has_role('admin') or has_role('area_lead_talent') or has_role('talent_team')
                  or has_role('marketing_team'), false)
$$;
