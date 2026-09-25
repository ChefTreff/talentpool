create or replace function set_my_speaker_profile(p_profile_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from speaker_profile sp where sp.id = p_profile_id) then
    raise exception 'speaker_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from speaker_profile sp
                  where sp.id = p_profile_id
                    and (sp.person_id = v_me or is_speaker_assistant(sp.id, v_me))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into speaker_portal_selection (person_id, profile_id, updated_at)
  values (v_me, p_profile_id, now())
  on conflict (person_id) do update set profile_id = excluded.profile_id, updated_at = now();
  return p_profile_id;
end $$;
