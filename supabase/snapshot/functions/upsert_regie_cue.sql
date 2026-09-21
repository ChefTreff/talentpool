create or replace function upsert_regie_cue(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_stage uuid; v_day uuid; v_start timestamptz; v_end timestamptz;
begin
  v_id := nullif(p_data->>'id', '')::uuid;
  v_stage := nullif(p_data->>'stage_id', '')::uuid;
  v_day := nullif(p_data->>'event_day_id', '')::uuid;
  v_start := nullif(p_data->>'cue_start', '')::timestamptz;
  v_end := nullif(p_data->>'cue_end', '')::timestamptz;

  -- Beim Ändern gilt die Bühne des Cues, nicht die im Aufruf: sonst liesse
  -- sich über eine fremde `stage_id` im Rumpf eine Zeile bewegen, für die
  -- man nicht zuständig ist.
  if v_id is not null then
    select c.stage_id, c.event_day_id into v_stage, v_day from regie_cue c where c.id = v_id;
    if v_stage is null then raise exception 'cue_not_found' using errcode = 'P0002'; end if;
  end if;
  if v_stage is null then
    raise exception 'invalid_cue' using errcode = '22023', detail = 'stage_id fehlt';
  end if;
  if not can_edit_regie(v_stage) then raise exception 'not allowed' using errcode = '42501'; end if;

  if v_id is null then
    if v_day is null or v_start is null or v_end is null then
      raise exception 'invalid_cue' using errcode = '22023',
        detail = 'stage_id, event_day_id, cue_start und cue_end sind Pflicht';
    end if;
    if not exists (select 1 from stage s join event_day d on d.event_id = s.event_id
                    where s.id = v_stage and d.id = v_day) then
      raise exception 'invalid_cue' using errcode = '22023',
        detail = 'Bühne und Tag gehören zu verschiedenen Veranstaltungen';
    end if;
    if nullif(p_data->>'slot_id', '') is not null and not exists (
         select 1 from slot sl where sl.id = (p_data->>'slot_id')::uuid
            and sl.stage_id = v_stage and sl.event_day_id = v_day) then
      raise exception 'invalid_cue' using errcode = '22023',
        detail = 'slot_id gehört nicht zu Bühne und Tag des Cues';
    end if;
    insert into regie_cue (stage_id, event_day_id, slot_id, cue_start, cue_end, sort_order,
                           action, umbau_min, moderation, regie, backstage, mobiliar, notes,
                           mic_assignments, media, created_by, updated_by)
    values (v_stage, v_day, nullif(p_data->>'slot_id', '')::uuid, v_start, v_end,
            coalesce((p_data->>'sort_order')::integer, 0),
            coalesce(nullif(btrim(p_data->>'action'), ''), '—'),
            nullif(p_data->>'umbau_min', '')::integer,
            nullif(p_data->>'moderation', ''), nullif(p_data->>'regie', ''),
            nullif(p_data->>'backstage', ''), nullif(p_data->>'mobiliar', ''),
            nullif(p_data->>'notes', ''),
            coalesce(p_data->'mic_assignments', '{}'::jsonb),
            coalesce(p_data->'media', '{}'::jsonb),
            current_person_id(), current_person_id())
    returning id into v_id;
  else
    if p_data ? 'slot_id' and nullif(p_data->>'slot_id', '') is not null then
      if not exists (select 1 from slot sl where sl.id = (p_data->>'slot_id')::uuid
                        and sl.stage_id = v_stage and sl.event_day_id = v_day) then
        raise exception 'invalid_cue' using errcode = '22023',
          detail = 'slot_id gehört nicht zu Bühne und Tag des Cues';
      end if;
    end if;
    -- Teilupdate über die mitgeschickten Schlüssel: was fehlt, bleibt stehen.
    update regie_cue set
      slot_id = case when p_data ? 'slot_id' then nullif(p_data->>'slot_id', '')::uuid else slot_id end,
      cue_start = coalesce(v_start, cue_start),
      cue_end = coalesce(v_end, cue_end),
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order),
      action = coalesce(nullif(btrim(p_data->>'action'), ''), action),
      umbau_min = case when p_data ? 'umbau_min' then nullif(p_data->>'umbau_min', '')::integer else umbau_min end,
      moderation = case when p_data ? 'moderation' then nullif(p_data->>'moderation', '') else moderation end,
      regie = case when p_data ? 'regie' then nullif(p_data->>'regie', '') else regie end,
      backstage = case when p_data ? 'backstage' then nullif(p_data->>'backstage', '') else backstage end,
      mobiliar = case when p_data ? 'mobiliar' then nullif(p_data->>'mobiliar', '') else mobiliar end,
      notes = case when p_data ? 'notes' then nullif(p_data->>'notes', '') else notes end,
      mic_assignments = coalesce(p_data->'mic_assignments', mic_assignments),
      media = coalesce(p_data->'media', media),
      updated_by = current_person_id(),
      updated_at = now()
    where id = v_id;
    if not found then raise exception 'cue_not_found' using errcode = 'P0002'; end if;
  end if;

  perform log_audit('regie.cue_saved', 'regie_cue', v_id::text, null, p_data);
  return v_id;
end $$;
