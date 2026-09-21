create or replace function upsert_event_day(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_event uuid; v_date date; v_before jsonb;
begin
  if v_id is not null then
    select ed.event_id into v_event from event_day ed where ed.id = v_id;
    if v_event is null then raise exception 'day_not_found' using errcode = 'P0002'; end if;
  else
    v_event := nullif(p_data->>'event_id', '')::uuid;
    if not exists (select 1 from event e where e.id = v_event) then
      raise exception 'event_not_found' using errcode = 'P0002';
    end if;
  end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;

  if v_id is null then
    v_date := (p_data->>'day_date')::date;
    select ed.id into v_id from event_day ed where ed.event_id = v_event and ed.day_date = v_date;
  end if;

  select to_jsonb(ed) into v_before from event_day ed where ed.id = v_id;

  if v_id is null then
    insert into event_day (event_id, day_date, label_de, label_en, doors_open, programme_start, programme_end, sort_order)
    values (v_event, v_date,
            nullif(btrim(p_data->>'label_de'), ''), nullif(btrim(p_data->>'label_en'), ''),
            nullif(p_data->>'doors_open', '')::time, nullif(p_data->>'programme_start', '')::time,
            nullif(p_data->>'programme_end', '')::time,
            coalesce((p_data->>'sort_order')::integer, 0))
    returning id into v_id;
  else
    update event_day set
      day_date        = coalesce(nullif(p_data->>'day_date', '')::date, day_date),
      label_de        = case when p_data ? 'label_de' then nullif(btrim(p_data->>'label_de'), '') else label_de end,
      label_en        = case when p_data ? 'label_en' then nullif(btrim(p_data->>'label_en'), '') else label_en end,
      doors_open      = case when p_data ? 'doors_open' then nullif(p_data->>'doors_open', '')::time else doors_open end,
      programme_start = case when p_data ? 'programme_start' then nullif(p_data->>'programme_start', '')::time else programme_start end,
      programme_end   = case when p_data ? 'programme_end' then nullif(p_data->>'programme_end', '')::time else programme_end end,
      sort_order      = coalesce((p_data->>'sort_order')::integer, sort_order)
    where id = v_id;
  end if;

  perform log_audit('programme.day_upsert', 'event_day', v_id::text, v_before, p_data);
  return v_id;
end $$;
