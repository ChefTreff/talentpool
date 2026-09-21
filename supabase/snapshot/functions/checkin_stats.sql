create or replace function checkin_stats(p_edition_id uuid DEFAULT NULL::uuid, p_day date DEFAULT NULL::date)
 RETURNS TABLE(pass_type text, checked_in integer, tickets integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; v_day date; v_tz text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := coalesce(p_edition_id, checkin_edition());
  if v_ed is null then raise exception 'edition_not_found' using errcode = 'P0002'; end if;
  if not can_read_checkin_stats(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(e.timezone, 'Europe/Berlin') into v_tz from event e where e.id = v_ed;
  v_day := coalesce(p_day, (now() at time zone coalesce(v_tz, 'Europe/Berlin'))::date);

  return query
    select coalesce(t.pass_type, 'ohne'),
           count(c.id)::integer,
           count(*)::integer
      from ticket t
      join event e on e.id = t.event_id
      left join checkin c on c.ticket_id = t.id and c.result = 'ok' and c.scan_day = v_day
     where coalesce(e.edition_id, e.id) = v_ed
       and t.status in ('valid', 'checked_in')
     group by coalesce(t.pass_type, 'ohne')
     order by coalesce(t.pass_type, 'ohne');
end $$;
