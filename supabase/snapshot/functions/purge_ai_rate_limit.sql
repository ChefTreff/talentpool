create or replace function purge_ai_rate_limit()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  if auth.uid() is not null and not is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from ai_rate_limit where window_start < now() - interval '24 hours';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
