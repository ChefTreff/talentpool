create or replace function volunteer_edition(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(p_edition_id,
    (select e.id from event e where e.is_edition and coalesce(e.end_date, current_date) >= current_date
      order by e.start_date nulls last limit 1))
$$;
