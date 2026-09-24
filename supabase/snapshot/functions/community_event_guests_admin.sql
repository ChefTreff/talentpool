create or replace function community_event_guests_admin(p_event_id uuid)
 RETURNS TABLE(person_id uuid, first_name text, last_name text, status text, registered_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_view_community_events() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select p.id, p.first_name, p.last_name, g.status, g.registered_at
      from registration g join person p on p.id = g.person_id
     where g.event_id = p_event_id and g.source = 'luma' and p.deleted_at is null
     order by g.status, p.last_name nulls last, p.first_name;
end $$;
