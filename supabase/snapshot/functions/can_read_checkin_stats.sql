create or replace function can_read_checkin_stats(p_edition_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select is_staff() or (p_edition_id is not null and checkin_edition() = p_edition_id)
$$;
