create or replace function can_edit_next_up()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(has_role('admin') or has_role('marketing_team') or has_role('area_lead_talent'), false)
$$;
