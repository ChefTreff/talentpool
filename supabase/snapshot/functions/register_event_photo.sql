create or replace function register_event_photo(p_event_id uuid, p_storage_path text, p_filename text, p_credit text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid;
begin
  if not can_manage_event_photos() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from event where id = p_event_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_storage_path is null or p_storage_path not like p_event_id::text || '/%'
     or split_part(p_storage_path, '/', 3) <> '' or split_part(p_storage_path, '/', 2) = '' then
    raise exception 'path_mismatch' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'event-photos' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002';
  end if;
  insert into event_photo (event_id, storage_path, filename, credit, sort_order, uploaded_by)
  values (p_event_id, p_storage_path, left(coalesce(nullif(btrim(p_filename), ''), 'foto'), 200),
          nullif(left(btrim(coalesce(p_credit, '')), 120), ''),
          coalesce((select max(sort_order) + 1 from event_photo where event_id = p_event_id), 0), current_person_id())
  returning id into v_id;
  perform log_audit('photo.uploaded', 'event', p_event_id::text, null, jsonb_build_object('photo_id', v_id));
  return v_id;
end $$;
