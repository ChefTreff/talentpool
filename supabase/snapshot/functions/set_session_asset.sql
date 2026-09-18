create or replace function set_session_asset(p_id uuid, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_before jsonb;
begin
  if not is_marketing_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select to_jsonb(a) into v_before from session_asset a where a.id = p_id;
  if v_before is null then raise exception 'asset_not_found' using errcode = 'P0002'; end if;
  update session_asset set
    credit     = case when p_data ? 'credit' then nullif(btrim(p_data->>'credit'), '') else credit end,
    cutout     = coalesce((p_data->>'cutout')::boolean, cutout),
    is_current = coalesce((p_data->>'is_current')::boolean, is_current)
  where id = p_id;
  perform log_audit('session_asset.update', 'session_asset', p_id::text, v_before, p_data);
end $$;
