create or replace function my_speaker_step_reopened(p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id(); v_steps jsonb;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile
   where id = coalesce(p_profile_id, my_speaker_profile_id(null));
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me)
                   or can_manage_speaker(v_sp.id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_steps := speaker_next_steps(v_sp.id);
  return coalesce((
    select array_agg(r.step_key order by r.step_key)
      from speaker_step_reopen r
     where r.profile_id = v_sp.id
       and (v_steps ->> r.step_key) = 'true'), '{}'::text[]);
end $$;
