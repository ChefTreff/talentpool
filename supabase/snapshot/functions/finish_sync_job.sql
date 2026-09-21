create or replace function finish_sync_job(p_id bigint, p_status text, p_stats jsonb DEFAULT '{}'::jsonb, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  update integration.sync_job set finished_at = now(), status = p_status, stats = coalesce(p_stats, '{}'::jsonb), error = p_error where id = p_id;
  if not found then raise exception 'sync_job_not_found' using errcode = 'P0002'; end if;
end $$;
