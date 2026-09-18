create or replace function delete_edition_info(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not can_edit_edition_info() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from edition_info where id = p_id;
  if not found then raise exception 'info_not_found' using errcode = 'P0002', detail = p_id::text; end if;
  perform log_audit('edition_info.delete', 'edition_info', p_id::text, null, null);
end $$;
