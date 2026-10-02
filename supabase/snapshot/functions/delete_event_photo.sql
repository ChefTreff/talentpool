create or replace function delete_event_photo(p_photo_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_p event_photo;
begin
  if not can_manage_event_photos() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_p from event_photo where id = p_photo_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Offene Löschwünsche zu diesem Foto sind damit erledigt (die Zeilen gehen mit dem Foto).
  delete from event_photo where id = p_photo_id;
  perform log_audit('photo.deleted', 'event', v_p.event_id::text, jsonb_build_object('photo_id', p_photo_id, 'filename', v_p.filename), null);
  return v_p.storage_path;
end $$;
