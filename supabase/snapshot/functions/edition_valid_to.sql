create or replace function edition_valid_to(p_edition_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select case when e.end_date is null then null else ((e.end_date + 1)::timestamp at time zone coalesce(e.timezone, 'Europe/Berlin')) end
  from event e where e.id = p_edition_id
$$;
