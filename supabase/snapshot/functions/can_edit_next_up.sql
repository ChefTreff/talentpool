create or replace function can_edit_next_up()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(has_admin_section('nextUp'), false)
$$;
