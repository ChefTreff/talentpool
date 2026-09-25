create or replace function checkin_admin_days(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tag date, label text, ok integer, duplicate integer, invalid integer, blocked integer, geraete integer, erster timestamp with time zone, letzter timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid;
begin
  if not has_admin_section('checkin') then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  if v_ed is null then raise exception 'edition_not_found' using errcode = 'P0002'; end if;
  return query
    -- Tage der Veranstaltung **und** Tage, an denen gescannt wurde: ein Scan am
    -- Aufbautag gehoert in die Liste, auch wenn er in keinem Programm steht.
    with tage as (
      select d.day_date as tag, nullif(btrim(d.label_de), '') as label
        from event_day d join event e on e.id = d.event_id
       where coalesce(e.edition_id, e.id) = v_ed
      union
      select c.scan_day, null from checkin c where c.edition_id = v_ed
    )
    select t.tag, t.label,
           count(*) filter (where c.result = 'ok')::integer,
           count(*) filter (where c.result = 'duplicate')::integer,
           count(*) filter (where c.result = 'invalid')::integer,
           count(*) filter (where c.result = 'blocked')::integer,
           count(distinct c.device_id)::integer,
           min(c.scanned_at), max(c.scanned_at)
      from tage t
      left join checkin c on c.edition_id = v_ed and c.scan_day = t.tag
     group by t.tag, t.label
     order by t.tag;
end $$;
