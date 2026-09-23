create or replace function set_speaker_task_tick(p_task_id uuid, p_done boolean, p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_task speaker_task%rowtype;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile
   where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or v_sp.assistant_person_id = v_me), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_task from speaker_task where id = p_task_id;
  if not found then raise exception 'task_not_found' using errcode = 'P0002'; end if;
  if v_task.edition_id <> v_sp.edition_id then
    raise exception 'task_wrong_edition' using errcode = 'P0001';
  end if;
  if not v_task.is_active then
    raise exception 'task_inactive' using errcode = 'P0001';
  end if;

  if p_done then
    insert into speaker_task_tick (profile_id, task_id, done_by)
    values (v_sp.id, p_task_id, v_me)
    on conflict (profile_id, task_id) do nothing;
  else
    delete from speaker_task_tick where profile_id = v_sp.id and task_id = p_task_id;
  end if;
end $$;
