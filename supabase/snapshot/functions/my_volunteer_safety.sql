create or replace function my_volunteer_safety(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(acknowledged_at timestamp with time zone, version text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id();
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select v.safety_ack_at, v.safety_ack_version from volunteer_profile v
     where v.person_id = v_pid and v.edition_id = volunteer_edition(p_edition_id);
end $$;
