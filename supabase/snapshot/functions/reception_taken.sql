create or replace function reception_taken(p_reception_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(sum(1 + r.guests), 0)::integer
    from speaker_reception_rsvp r
   where r.reception_id = p_reception_id and r.status = 'yes'
$$;
