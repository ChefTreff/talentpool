create or replace function send_shift_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; v_n integer := 0; v_locale text;
begin
  for r in
    select a.id, a.person_id, s.area, s.position, s.start_at, s.location, s.edition_id, s.briefing_md
      from shift_assignment a join shift s on s.id = a.shift_id
     where a.status in ('assigned', 'confirmed') and a.reminded_at is null
       and s.start_at between now() and now() + interval '48 hours'
  loop
    select coalesce(p.preferred_language, 'de') into v_locale from person p where p.id = r.person_id;
    perform queue_mail('shift_reminder', r.person_id,
                       jsonb_build_object('area', r.area, 'position', r.position,
                                          'start_at', mail_fmt_ts(r.start_at, coalesce((select e.timezone from event e where e.id = r.edition_id), 'Europe/Berlin'), v_locale),
                                          'location', coalesce(r.location, '')),
                       'shift_assignment', r.id);
    update shift_assignment set reminded_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
