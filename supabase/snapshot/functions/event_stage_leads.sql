create or replace function event_stage_leads(p_event_id uuid)
 RETURNS TABLE(person_id uuid, scope_type text, scope_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select ra.person_id, ra.scope_type, ra.scope_id
    from role_assignment ra
    join person p on p.id = ra.person_id and p.deleted_at is null and p.access_blocked_at is null
    join stage st on st.id = scope_stage_id(ra.scope_type, ra.scope_id)
   where ra.role = 'speaker_manager'
     and ra.scope_type in ('stage', 'stage_day', 'slot')
     and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
     and st.event_id = p_event_id
$$;
