create or replace function my_shifts(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(assignment_id uuid, shift_id uuid, status text, area text, "position" text, start_at timestamp with time zone, end_at timestamp with time zone, location text, briefing_md text, lead_name text, confirmed_at timestamp with time zone, day_label_de text, day_label_en text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_ed uuid;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select a.id, s.id, a.status, s.area, s.position, s.start_at, s.end_at, s.location, s.briefing_md,
           (select trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) from person p where p.id = s.lead_person_id),
           a.confirmed_at, d.label_de, d.label_en
      from shift_assignment a join shift s on s.id = a.shift_id
      left join event_day d on d.id = s.event_day_id
     where a.person_id = v_pid and s.edition_id = v_ed and a.status <> 'declined'
     order by s.start_at;
end $$;
