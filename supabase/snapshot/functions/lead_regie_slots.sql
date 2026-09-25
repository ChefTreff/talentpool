create or replace function lead_regie_slots()
 RETURNS TABLE(slot_id uuid, stage_id uuid, stage_name text, event_day_id uuid, day_date date, start_at timestamp with time zone, end_at timestamp with time zone, slot_type text, session_id uuid, title text, format text, speakers jsonb, tech jsonb, cue_id uuid, people_on_stage text, mic text, media text, mobiliar text, notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select sl.id, st.id, st.name, d.id, d.day_date, sl.start_at, sl.end_at, sl.slot_type,
           se.id, coalesce(se.title_de, se.title_en), se.format,
           case when se.id is null then '[]'::jsonb else coalesce(session_speakers_public(se.id), '[]'::jsonb) end,
           coalesce(se.tech, '{}'::jsonb),
           c.id, c.people_on_stage, c.mic_assignments->>'text', c.media->>'text', c.mobiliar, c.notes
      from slot sl
      join stage st on st.id = sl.stage_id
      join event_day d on d.id = sl.event_day_id
      left join session se on se.slot_id = sl.id
      left join lateral (
        select c0.* from regie_cue c0 where c0.slot_id = sl.id
         order by c0.cue_start, c0.sort_order, c0.created_at limit 1) c on true
     where st.active
       and sl.slot_type <> 'frame'
       and can_edit_regie(st.id)
     order by d.day_date, st.sort_order, st.name, sl.start_at;
end $$;
