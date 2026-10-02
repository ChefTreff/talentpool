create or replace function my_photo_events()
 RETURNS TABLE(event_id uuid, event_name text, start_date date, photos integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select e.id, e.name, e.start_date, count(p.id)::integer
      from event e join event_photo p on p.event_id = e.id and p.published
     where attended_event(e.id)
     group by e.id, e.name, e.start_date
     order by e.start_date desc nulls last;
end $$;
