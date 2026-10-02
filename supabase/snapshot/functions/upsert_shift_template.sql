create or replace function upsert_shift_template(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_ed uuid; v_area text; v_pos text; v_start time; v_end time; v_wd integer;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_area := nullif(btrim(coalesce(p_data->>'area', '')), '');
  if v_area is not null and not is_vocab_key('volunteer_area', v_area) then
    raise exception 'invalid_area' using errcode = '22023', detail = v_area;
  end if;
  v_pos := nullif(btrim(coalesce(p_data->>'position', '')), '');
  begin
    v_start := nullif(p_data->>'start_time', '')::time;
    v_end := nullif(p_data->>'end_time', '')::time;
  exception when others then raise exception 'invalid_times' using errcode = '22023';
  end;
  v_wd := nullif(p_data->>'weekday', '')::integer;
  if v_wd is not null and v_wd not between 1 and 7 then raise exception 'invalid_times' using errcode = '22023'; end if;
  if v_id is null then
    v_ed := volunteer_edition(nullif(p_data->>'edition_id', '')::uuid);
    if v_ed is null then raise exception 'edition_required' using errcode = '22023'; end if;
    if v_area is null or v_pos is null or v_start is null or v_end is null then
      raise exception 'fields_required' using errcode = '22023';
    end if;
    if v_start = v_end then raise exception 'invalid_times' using errcode = '22023'; end if;
    insert into shift_template (edition_id, area, position, weekday, start_time, end_time, capacity, overbook, location, briefing_md, sort_order, active)
    values (v_ed, v_area, v_pos, v_wd, v_start, v_end,
            greatest(coalesce((p_data->>'capacity')::integer, 1), 1), greatest(coalesce((p_data->>'overbook')::integer, 0), 0),
            nullif(btrim(coalesce(p_data->>'location', '')), ''), nullif(btrim(coalesce(p_data->>'briefing_md', '')), ''),
            coalesce((p_data->>'sort_order')::integer, 0), coalesce((p_data->>'active')::boolean, true))
    returning id into v_id;
  else
    if not exists (select 1 from shift_template where id = v_id) then raise exception 'template_not_found' using errcode = 'P0002'; end if;
    if v_start is not null and v_end is not null and v_start = v_end then raise exception 'invalid_times' using errcode = '22023'; end if;
    update shift_template set
      area        = coalesce(v_area, area),
      position    = coalesce(v_pos, position),
      weekday     = case when p_data ? 'weekday' then v_wd else weekday end,
      start_time  = coalesce(v_start, start_time),
      end_time    = coalesce(v_end, end_time),
      capacity    = case when p_data ? 'capacity' then greatest((p_data->>'capacity')::integer, 1) else capacity end,
      overbook    = case when p_data ? 'overbook' then greatest((p_data->>'overbook')::integer, 0) else overbook end,
      location    = case when p_data ? 'location' then nullif(btrim(coalesce(p_data->>'location', '')), '') else location end,
      briefing_md = case when p_data ? 'briefing_md' then nullif(btrim(coalesce(p_data->>'briefing_md', '')), '') else briefing_md end,
      sort_order  = case when p_data ? 'sort_order' then (p_data->>'sort_order')::integer else sort_order end,
      active      = case when p_data ? 'active' then (p_data->>'active')::boolean else active end,
      updated_at  = now()
    where id = v_id;
  end if;
  perform log_audit('volunteer.upsert_shift_template', 'shift_template', v_id::text, null, p_data);
  return v_id;
end $$;
