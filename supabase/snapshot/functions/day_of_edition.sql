create or replace function day_of_edition(p_day_id uuid, p_edition_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
    select 1 from event_day d join event e on e.id = d.event_id
     where d.id = p_day_id and (e.id = p_edition_id or e.edition_id = p_edition_id))
$$;
