create or replace function event_photos_admin(p_event_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(event_id uuid, event_name text, start_date date, photo_id uuid, storage_path text, filename text, credit text, published boolean, open_requests integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not can_manage_event_photos() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select e.id, e.name, e.start_date, p.id, p.storage_path, p.filename, p.credit, p.published,
           (select count(*)::integer from event_photo_removal_request r where r.photo_id = p.id and r.status = 'open')
      from event_photo p join event e on e.id = p.event_id
     where p_event_id is null or p.event_id = p_event_id
     order by e.start_date desc nulls last, p.sort_order, p.created_at;
end $$;
