create or replace function promote_shift_waitlist(p_shift_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_s shift; v_free integer; v_n integer := 0; r record;
begin
  select * into v_s from shift where id = p_shift_id;
  if not found then return 0; end if;
  v_free := v_s.capacity + v_s.overbook - shift_taken(p_shift_id);
  for r in select a.id, a.person_id from shift_assignment a
            where a.shift_id = p_shift_id and a.status = 'waitlisted' order by a.created_at limit greatest(v_free, 0)
  loop
    update shift_assignment set status = 'assigned' where id = r.id;
    perform queue_mail('shift_assigned', r.person_id,
                       jsonb_build_object('area', v_s.area, 'position', v_s.position,
                                          'start_at', mail_fmt_ts(v_s.start_at, coalesce((select e.timezone from event e where e.id = v_s.edition_id), 'Europe/Berlin'),
                                                                  coalesce((select p.preferred_language from person p where p.id = r.person_id), 'de')),
                                          'location', coalesce(v_s.location, '')),
                       'shift_assignment', r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
