create or replace function delete_stage_blocked_time(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_row stage_blocked_time%rowtype;
begin
  if not has_admin_section('programme') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_row from stage_blocked_time where id = p_id for update;
  if not found then raise exception 'blocked_time_not_found' using errcode = 'P0002'; end if;
  delete from stage_blocked_time where id = p_id;
  perform log_audit('programme.blocked_time_delete', 'stage_blocked_time', p_id::text, to_jsonb(v_row), null);
end $$;
