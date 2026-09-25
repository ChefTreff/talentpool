create or replace function set_regie_anweisungen(p_slot_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sl slot%rowtype; v_cue uuid; v_bad text; v_titel text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sl from slot where id = p_slot_id;
  if not found then raise exception 'slot_not_found' using errcode = 'P0002'; end if;
  if not can_edit_regie(v_sl.stage_id) then raise exception 'not allowed' using errcode = '42501'; end if;

  select string_agg(k, ',') into v_bad from jsonb_object_keys(coalesce(p_data, '{}'::jsonb)) k
   where k not in ('people_on_stage', 'mic', 'media', 'mobiliar', 'notes');
  if v_bad is not null then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_bad;
  end if;

  -- Der erste Cue des Slots trägt die Anweisungen (wie in `lead_regie_slots`).
  select c.id into v_cue from regie_cue c
   where c.slot_id = p_slot_id
   order by c.cue_start, c.sort_order, c.created_at
   limit 1
   for update;

  if v_cue is null then
    select coalesce(se.title_de, se.title_en) into v_titel from session se where se.slot_id = p_slot_id limit 1;
    insert into regie_cue (stage_id, event_day_id, slot_id, cue_start, cue_end, action,
                           people_on_stage, mobiliar, notes, mic_assignments, media, created_by, updated_by)
    values (v_sl.stage_id, v_sl.event_day_id, v_sl.id, v_sl.start_at, v_sl.end_at, coalesce(v_titel, '—'),
            nullif(btrim(p_data->>'people_on_stage'), ''), nullif(btrim(p_data->>'mobiliar'), ''),
            nullif(btrim(p_data->>'notes'), ''),
            case when nullif(btrim(p_data->>'mic'), '') is null then '{}'::jsonb
                 else jsonb_build_object('text', btrim(p_data->>'mic')) end,
            case when nullif(btrim(p_data->>'media'), '') is null then '{}'::jsonb
                 else jsonb_build_object('text', btrim(p_data->>'media')) end,
            current_person_id(), current_person_id())
    returning id into v_cue;
    return v_cue;
  end if;

  -- Teilupdate über die mitgeschickten Schlüssel; Zeiten und Ablauf bleiben.
  update regie_cue set
    people_on_stage = case when p_data ? 'people_on_stage' then nullif(btrim(p_data->>'people_on_stage'), '') else people_on_stage end,
    mobiliar        = case when p_data ? 'mobiliar'        then nullif(btrim(p_data->>'mobiliar'), '')        else mobiliar end,
    notes           = case when p_data ? 'notes'           then nullif(btrim(p_data->>'notes'), '')           else notes end,
    mic_assignments = case when not p_data ? 'mic' then mic_assignments
                           when nullif(btrim(p_data->>'mic'), '') is null then mic_assignments - 'text'
                           else mic_assignments || jsonb_build_object('text', btrim(p_data->>'mic')) end,
    media           = case when not p_data ? 'media' then media
                           when nullif(btrim(p_data->>'media'), '') is null then media - 'text'
                           else media || jsonb_build_object('text', btrim(p_data->>'media')) end,
    updated_by      = current_person_id()
  where id = v_cue;
  return v_cue;
end $$;
