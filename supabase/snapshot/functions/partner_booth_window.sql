create or replace function partner_booth_window(p_stage_id uuid, p_event_day_id uuid)
 RETURNS TABLE(von time without time zone, bis time without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select case when sd.open_from is not null then (sd.open_from + interval '90 minutes')::time end,
         least(coalesce(sd.open_to, time '19:00'), time '19:00')
    from stage st
    left join stage_day sd on sd.stage_id = st.id and sd.event_day_id = p_event_day_id
   where st.id = p_stage_id and st.type = 'partner_booth'
$$;
