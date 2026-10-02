create or replace function handle_photo_removal(p_request_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not can_manage_event_photos() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('done', 'rejected') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update event_photo_removal_request set status = p_status, handled_by = current_person_id(), handled_at = now()
   where id = p_request_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform log_audit('photo.removal_handled', 'event_photo_removal_request', p_request_id::text, null, jsonb_build_object('status', p_status));
end $$;
