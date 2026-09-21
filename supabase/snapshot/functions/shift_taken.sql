create or replace function shift_taken(p_shift_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select count(*)::integer from shift_assignment a
   where a.shift_id = p_shift_id and a.status in ('assigned', 'confirmed')
$$;
