create or replace function partner_booth_window(p_stage_id uuid, p_event_day_id uuid)
 RETURNS TABLE(von time without time zone, bis time without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(sd.open_from, ed.programme_start),
         coalesce(sd.open_to, ed.programme_end, time '24:00')
    from stage st
    left join stage_day sd on sd.stage_id = st.id and sd.event_day_id = p_event_day_id
    left join event_day ed on ed.id = p_event_day_id and ed.event_id = st.event_id
   where st.id = p_stage_id and st.type = 'partner_booth'
$$;
