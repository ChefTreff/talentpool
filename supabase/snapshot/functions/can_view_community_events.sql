create or replace function can_view_community_events()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(has_admin_section('communityEvents'), false)
$$;
