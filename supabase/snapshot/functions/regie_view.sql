create or replace function regie_view(p_stage_id uuid, p_event_day_id uuid)
 RETURNS TABLE(cue_id uuid, cue_start timestamp with time zone, cue_end timestamp with time zone, sort_order integer, action text, umbau_min integer, moderation text, regie text, backstage text, mobiliar text, notes text, people_on_stage text, mic_assignments jsonb, media jsonb, slot_id uuid, slot_status text, session_id uuid, title text, format text, speakers jsonb, tech jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not can_edit_regie(p_stage_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select c.id, c.cue_start, c.cue_end, c.sort_order,
           c.action, c.umbau_min, c.moderation, c.regie, c.backstage,
           c.mobiliar, c.notes, c.people_on_stage, c.mic_assignments, c.media,
           c.slot_id, sl.status, se.id,
           coalesce(se.title_de, se.title_en), se.format,
           case when se.id is null then '[]'::jsonb else session_speakers_public(se.id) end,
           -- Cues ohne Session (Doors open, Puffer, Soundcheck) haben keine
           -- Ansage; `coalesce` hält die Spalte leer statt null, damit die
           -- Oberfläche nicht je Zeile unterscheiden muss.
           coalesce(se.tech, '{}'::jsonb)
      from regie_cue c
      left join slot sl on sl.id = c.slot_id
      left join session se on se.slot_id = sl.id
     where c.stage_id = p_stage_id and c.event_day_id = p_event_day_id
     order by c.cue_start, c.sort_order;
end $$;
