create or replace function shift_plan(p_edition_id uuid DEFAULT NULL::uuid, p_day uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, event_day_id uuid, area text, "position" text, start_at timestamp with time zone, end_at timestamp with time zone, capacity integer, overbook integer, location text, lead_person_id uuid, lead_name text, briefing_md text, active boolean, taken integer, waitlisted integer, people jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select s.id, s.event_day_id, s.area, s.position, s.start_at, s.end_at, s.capacity, s.overbook, s.location, s.lead_person_id,
           (select trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) from person p where p.id = s.lead_person_id),
           s.briefing_md, s.active, shift_taken(s.id),
           (select count(*)::integer from shift_assignment a where a.shift_id = s.id and a.status = 'waitlisted'),
           coalesce((select jsonb_agg(jsonb_build_object('assignment_id', a.id, 'person_id', a.person_id, 'status', a.status,
                                                          'name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')))
                              order by a.created_at)
                       from shift_assignment a join person p on p.id = a.person_id
                      where a.shift_id = s.id and a.status <> 'declined'), '[]'::jsonb)
      from shift s
     where s.edition_id = v_ed and (p_day is null or s.event_day_id = p_day)
     order by s.start_at, s.area, s.position;
end $$;
