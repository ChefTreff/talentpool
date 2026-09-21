create or replace function is_speaker_side_of(p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
    select 1 from session_speaker ss
    where ss.session_id = p_session_id
      and (ss.person_id = current_person_id()
           or exists (select 1 from speaker_profile sp where sp.person_id = ss.person_id and sp.assistant_person_id = current_person_id()))
  )
$$;
