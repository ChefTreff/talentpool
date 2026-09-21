create or replace function start_sync_job(p_system text, p_direction text, p_job_type text, p_triggered_by text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id bigint;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into integration.sync_job (system, direction, job_type, started_at, status, stats, triggered_by)
  values (p_system, p_direction, p_job_type, now(), 'running', '{}'::jsonb, p_triggered_by) returning id into v_id;
  return v_id;
end $$;
