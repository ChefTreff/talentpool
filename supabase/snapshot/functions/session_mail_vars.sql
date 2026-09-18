create or replace function session_mail_vars(p_session_id uuid, p_locale text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select jsonb_build_object(
    'session_id', s.id,
    'session_title', coalesce(case when p_locale = 'en' then s.title_en else s.title_de end, s.title_de, s.title_en, ''),
    'session_time', case
      when sl.id is null then case when p_locale = 'en' then 'time to be announced' else 'Zeit folgt' end
      when p_locale = 'en' then
        to_char(sl.start_at at time zone coalesce(e.timezone, 'Europe/Berlin'), 'DD Mon YYYY, HH24:MI') || '–'
        || to_char(sl.end_at at time zone coalesce(e.timezone, 'Europe/Berlin'), 'HH24:MI')
      else
        to_char(sl.start_at at time zone coalesce(e.timezone, 'Europe/Berlin'), 'DD.MM.YYYY, HH24:MI') || '–'
        || to_char(sl.end_at at time zone coalesce(e.timezone, 'Europe/Berlin'), 'HH24:MI') || ' Uhr'
    end,
    'stage_name', coalesce(st.name, case when p_locale = 'en' then 'stage to be announced' else 'Bühne folgt' end),
    'event_name', coalesce(e.name, '')
  )
  from session s
  left join slot sl on sl.id = s.slot_id
  left join stage st on st.id = sl.stage_id
  left join event e on e.id = s.event_id
  where s.id = p_session_id
$$;
