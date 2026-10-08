create or replace function can_edit_deadline(p_audience text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select has_admin_section(deadline_section(p_audience))
$$;
