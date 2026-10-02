create or replace function apply_shift_templates(p_template_ids uuid[], p_day_ids uuid[], p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v_n integer := 0; v_k integer; t record; d record; v_start timestamptz; v_end timestamptz; v_zone text;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := volunteer_edition(p_edition_id);
  if coalesce(cardinality(p_template_ids), 0) = 0 or coalesce(cardinality(p_day_ids), 0) = 0 then
    raise exception 'fields_required' using errcode = '22023';
  end if;
  if cardinality(p_template_ids) > 200 or cardinality(p_day_ids) > 30 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  for d in select * from unnest(p_day_ids) as x(id) loop
    if not day_of_edition(d.id, v_ed) then raise exception 'day_not_found' using errcode = 'P0002', detail = d.id::text; end if;
  end loop;
  for t in select * from shift_template where id = any (p_template_ids) and edition_id = v_ed and active order by sort_order, start_time loop
    for d in select ed.id, ed.day_date, coalesce(e.timezone, 'Europe/Berlin') as zone
               from event_day ed join event e on e.id = ed.event_id
              where ed.id = any (p_day_ids) and (t.weekday is null or t.weekday = extract(isodow from ed.day_date)::integer) loop
      v_start := (d.day_date + t.start_time) at time zone d.zone;
      v_end := (d.day_date + t.end_time + case when t.end_time <= t.start_time then interval '1 day' else interval '0' end) at time zone d.zone;
      insert into shift (edition_id, event_day_id, area, position, start_at, end_at, capacity, overbook, location, briefing_md, active, template_id)
      values (v_ed, d.id, t.area, t.position, v_start, v_end, t.capacity, t.overbook, t.location, t.briefing_md, true, t.id)
      on conflict (template_id, event_day_id) where template_id is not null do nothing;
      get diagnostics v_k = row_count;
      v_n := v_n + v_k;
    end loop;
  end loop;
  perform log_audit('volunteer.apply_shift_templates', 'event', v_ed::text, null,
                    jsonb_build_object('templates', cardinality(p_template_ids), 'days', cardinality(p_day_ids), 'created', v_n));
  return v_n;
end $$;
