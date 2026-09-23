create or replace function delete_speaker_task(p_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_task speaker_task%rowtype; v_n integer;
begin
  select * into v_task from speaker_task where id = p_task_id;
  if not found then raise exception 'task_not_found' using errcode = 'P0002'; end if;
  if not is_speaker_team(v_task.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;

  select count(*) into v_n from speaker_task_tick where task_id = p_task_id;
  if v_n > 0 then
    raise exception 'task_has_ticks' using errcode = 'P0001', detail = v_n::text;
  end if;

  delete from speaker_task where id = p_task_id;
  perform log_audit('speaker_task.delete', 'speaker_task', p_task_id::text,
                    jsonb_build_object('key', v_task.key), null);
end $$;
