create or replace function my_community_registrations()
 RETURNS TABLE(luma_event_id text, event_id uuid, status text, registered_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select r.external_id, g.event_id, g.status, g.registered_at
      from registration g
      join external_ref r on r.system = 'luma' and r.object_type = 'event' and r.object_id = g.event_id
     where g.person_id = v_me and g.source = 'luma'
     order by g.registered_at desc;
end $$;
