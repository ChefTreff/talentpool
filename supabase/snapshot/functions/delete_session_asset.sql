create or replace function delete_session_asset(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_before jsonb; v_path text;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  select to_jsonb(a), a.storage_path into v_before, v_path from session_asset a where a.id = p_id;
  if v_before is null then raise exception 'asset_not_found' using errcode = 'P0002'; end if;
  delete from session_asset where id = p_id;
  perform log_audit('session_asset.delete', 'session_asset', p_id::text, v_before, null);
  return v_path;
end $$;
