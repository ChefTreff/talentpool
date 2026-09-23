create or replace function can_request_shuttle(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_person uuid; v_assistant uuid;
begin
  if v_me is null then return false; end if;
  select sp.person_id, sp.assistant_person_id into v_person, v_assistant
    from speaker_profile sp where sp.id = p_profile_id;
  if not found then return false; end if;
  -- `coalesce` bleibt, obwohl `is_speaker_assistant` nie NULL zurueckgibt:
  -- `can_manage_speaker` kann es, und `false or false or NULL` ist NULL, nicht
  -- false. Ein `if not NULL` loest nicht aus — genau im Fall, der abgewiesen
  -- gehoeren haette (Hotfix 0118).
  return coalesce(v_person = v_me or is_speaker_assistant(p_profile_id, v_me) or can_manage_speaker(p_profile_id), false);
end $$;
