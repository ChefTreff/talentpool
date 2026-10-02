create or replace function shift_templates(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, area text, "position" text, weekday integer, start_time time without time zone, end_time time without time zone, capacity integer, overbook integer, location text, briefing_md text, sort_order integer, active boolean, used integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  return query
    select t.id, t.area, t.position, t.weekday, t.start_time, t.end_time, t.capacity, t.overbook, t.location, t.briefing_md,
           t.sort_order, t.active, (select count(*)::integer from shift s where s.template_id = t.id)
      from shift_template t
     where t.edition_id = v_ed
     order by t.area, t.sort_order, t.start_time, t.position;
end $$;
