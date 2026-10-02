create or replace function photo_removal_requests_admin()
 RETURNS TABLE(request_id uuid, photo_id uuid, event_name text, filename text, first_name text, last_name text, note text, status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not can_manage_event_photos() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.id, p.id, e.name, p.filename, pe.first_name, pe.last_name, r.note, r.status, r.created_at
      from event_photo_removal_request r
      join event_photo p on p.id = r.photo_id
      join event e on e.id = p.event_id
      join person pe on pe.id = r.person_id
     order by (r.status = 'open') desc, r.created_at desc;
end $$;
