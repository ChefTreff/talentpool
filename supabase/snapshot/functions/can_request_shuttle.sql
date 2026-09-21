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
  -- `coalesce` ist hier kein Schmuck, sondern die Rechtepruefung selbst:
  -- ohne hinterlegte Assistenz ist `v_assistant = v_me` **NULL**, und
  -- `false or NULL or false` ist NULL, nicht false. Ein `if not NULL` loest
  -- nicht aus — genau im Fall, der abgewiesen gehoeren haette. Derselbe
  -- Fehler steckte live in sieben Speaker-Funktionen (Hotfix 0118).
  return coalesce(v_person = v_me or v_assistant = v_me or can_manage_speaker(p_profile_id), false);
end $$;
