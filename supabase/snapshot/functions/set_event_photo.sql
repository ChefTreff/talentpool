create or replace function set_event_photo(p_photo_id uuid, p_published boolean, p_credit text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_p event_photo;
begin
  if not can_manage_event_photos() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_p from event_photo where id = p_photo_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update event_photo set published = coalesce(p_published, false),
                         credit = nullif(left(btrim(coalesce(p_credit, '')), 120), '')
   where id = p_photo_id;
  perform log_audit('photo.updated', 'event', v_p.event_id::text, jsonb_build_object('published', v_p.published),
                    jsonb_build_object('photo_id', p_photo_id, 'published', coalesce(p_published, false)));
end $$;
