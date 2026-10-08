create or replace function side_event_taken(p_side_event_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(sum(1 + i.guests), 0)::integer
    from side_event_invite i
   where i.side_event_id = p_side_event_id and i.status = 'yes'
$$;
