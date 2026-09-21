create or replace function regie_open_slots(p_stage_id uuid, p_event_day_id uuid)
 RETURNS TABLE(slot_id uuid, start_at timestamp with time zone, end_at timestamp with time zone, title text, format text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not can_edit_regie(p_stage_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select sl.id, sl.start_at, sl.end_at, coalesce(se.title_de, se.title_en), se.format
      from slot sl
      left join session se on se.slot_id = sl.id
     where sl.stage_id = p_stage_id and sl.event_day_id = p_event_day_id
       and not exists (select 1 from regie_cue c where c.slot_id = sl.id)
     order by sl.start_at;
end $$;
