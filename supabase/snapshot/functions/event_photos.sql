create or replace function event_photos(p_event_id uuid)
 RETURNS TABLE(photo_id uuid, storage_path text, filename text, credit text, removal_requested boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not attended_event(p_event_id) then raise exception 'not_attended' using errcode = '42501'; end if;
  return query
    select p.id, p.storage_path, p.filename, p.credit,
           exists (select 1 from event_photo_removal_request r where r.photo_id = p.id
                    and r.person_id = current_person_id() and r.status = 'open')
      from event_photo p
     where p.event_id = p_event_id and p.published
     order by p.sort_order, p.created_at;
end $$;
