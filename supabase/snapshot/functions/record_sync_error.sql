create or replace function record_sync_error(p_job_id bigint, p_object_type text, p_object_id text, p_message text, p_payload jsonb DEFAULT NULL::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id bigint;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into integration.sync_error (job_id, object_type, object_id, message, payload) values (p_job_id, p_object_type, p_object_id, p_message, p_payload) returning id into v_id;
  return v_id;
end $$;
