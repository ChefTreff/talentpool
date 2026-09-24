create or replace function community_events_admin()
 RETURNS TABLE(event_id uuid, luma_event_id text, name text, start_date date, location text, url text, registered integer, pending integer, waitlisted integer, attended integer, total integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_view_community_events() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select e.id, r.external_id, e.name, e.start_date, e.location, r.meta->>'url',
           count(g.id) filter (where g.status = 'confirmed')::int,
           count(g.id) filter (where g.status = 'applied')::int,
           count(g.id) filter (where g.status = 'waitlisted')::int,
           count(g.id) filter (where g.status = 'attended')::int,
           count(g.id)::int
      from event e
      join external_ref r on r.system = 'luma' and r.object_type = 'event' and r.object_id = e.id
      left join registration g on g.event_id = e.id and g.source = 'luma'
     where e.format_tag = 'community'
     group by e.id, r.external_id, r.meta
     order by e.start_date desc nulls last, e.name;
end $$;
