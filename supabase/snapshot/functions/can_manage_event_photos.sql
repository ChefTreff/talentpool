create or replace function can_manage_event_photos()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select current_person_id() is not null and coalesce(has_admin_section('photos'), false)
$$;
