create or replace function delete_portal_video(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from portal_video where id = p_id;
  if not found then raise exception 'video_not_found' using errcode = 'P0002', detail = p_id::text; end if;
  perform log_audit('portal_video.delete', 'portal_video', p_id::text, null, null);
end $$;
