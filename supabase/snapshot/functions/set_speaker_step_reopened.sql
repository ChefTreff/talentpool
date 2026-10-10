create or replace function set_speaker_step_reopened(p_step_key text, p_reopened boolean, p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile
   where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_step_key is null
     or p_step_key not in ('profile', 'photo', 'consents', 'session', 'session_content', 'presentation', 'ticket') then
    raise exception 'invalid_step' using errcode = '22023', detail = coalesce(p_step_key, 'null');
  end if;

  if p_reopened is true then
    if coalesce(speaker_next_steps(v_sp.id) ->> p_step_key, '') <> 'true' then
      raise exception 'step_not_done' using errcode = 'P0001', detail = p_step_key;
    end if;
    insert into speaker_step_reopen (profile_id, step_key, reopened_by)
    values (v_sp.id, p_step_key, v_me)
    on conflict (profile_id, step_key) do nothing;
  else
    delete from speaker_step_reopen where profile_id = v_sp.id and step_key = p_step_key;
  end if;
end $$;
