create or replace function my_lead_shifts(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, event_day_id uuid, area text, "position" text, start_at timestamp with time zone, end_at timestamp with time zone, location text, briefing_md text, capacity integer, overbook integer, taken integer, people jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select s.id, s.event_day_id, s.area, s.position, s.start_at, s.end_at, s.location, s.briefing_md,
           s.capacity, s.overbook, shift_taken(s.id),
           coalesce((select jsonb_agg(jsonb_build_object('name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
                                                          'status', a.status) order by a.created_at)
                       from shift_assignment a join person p on p.id = a.person_id
                      where a.shift_id = s.id and a.status in ('assigned', 'confirmed')), '[]'::jsonb)
      from shift s
     where s.edition_id = v_ed and s.active and s.lead_person_id = v_me
     order by s.start_at;
end $$;
