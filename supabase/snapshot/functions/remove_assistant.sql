create or replace function remove_assistant(p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  select * into v_sp from speaker_profile where id = p_profile_id for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not (v_sp.person_id = v_me or can_manage_speaker(p_profile_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_sp.assistant_person_id is null then return; end if;
  update speaker_profile set assistant_person_id = null where id = p_profile_id;
  if not exists (select 1 from speaker_profile s where s.assistant_person_id = v_sp.assistant_person_id and s.edition_id = v_sp.edition_id) then
    update role_assignment set valid_to = greatest(now(), valid_from + interval '1 second')
     where person_id = v_sp.assistant_person_id and role = 'speaker_assistant' and scope_type = 'edition' and edition_id = v_sp.edition_id and (valid_to is null or valid_to > now());
  end if;
  perform log_audit('speaker.assistant_remove', 'speaker_profile', p_profile_id::text, jsonb_build_object('assistant', v_sp.assistant_person_id), null);
end $$;
