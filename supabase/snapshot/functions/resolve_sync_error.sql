create or replace function resolve_sync_error(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  update integration.sync_error set resolved_at = now() where id = p_id and resolved_at is null;
  if not found then raise exception 'sync_error_not_found' using errcode = 'P0002'; end if;
  perform log_audit('integration.resolve_error', 'sync_error', p_id::text, null, null);
end $$;
