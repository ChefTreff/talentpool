create or replace function upsert_stage_day(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_stage uuid := nullif(p_data->>'stage_id', '')::uuid;
        v_day uuid := nullif(p_data->>'event_day_id', '')::uuid;
        v_event uuid; v_id uuid; v_from time; v_to time; v_before jsonb;
begin
  select st.event_id into v_event from stage st where st.id = v_stage;
  if v_event is null then raise exception 'stage_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from event_day ed where ed.id = v_day and ed.event_id = v_event) then
    raise exception 'day_not_found' using errcode = 'P0002';
  end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_from := nullif(p_data->>'open_from', '')::time;
  v_to   := nullif(p_data->>'open_to', '')::time;
  if v_from is not null and v_to is not null and v_to <= v_from then
    raise exception 'invalid_times' using errcode = '22023';
  end if;

  select to_jsonb(sd) into v_before from stage_day sd
   where sd.stage_id = v_stage and sd.event_day_id = v_day;

  insert into stage_day (stage_id, event_day_id, open_from, open_to, slot_quota, notes)
  values (v_stage, v_day, v_from, v_to, (p_data->>'slot_quota')::integer, nullif(btrim(p_data->>'notes'), ''))
  on conflict (stage_id, event_day_id) do update set
    open_from  = case when p_data ? 'open_from' then excluded.open_from else stage_day.open_from end,
    open_to    = case when p_data ? 'open_to' then excluded.open_to else stage_day.open_to end,
    slot_quota = case when p_data ? 'slot_quota' then excluded.slot_quota else stage_day.slot_quota end,
    notes      = case when p_data ? 'notes' then excluded.notes else stage_day.notes end
  returning id into v_id;

  perform log_audit('programme.stage_day_upsert', 'stage_day', v_id::text, v_before, p_data);
  return v_id;
end $$;
