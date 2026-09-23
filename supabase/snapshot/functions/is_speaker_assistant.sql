create or replace function is_speaker_assistant(p_profile_id uuid, p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select p_person_id is not null and p_profile_id is not null and (
    exists (select 1 from speaker_profile sp
             where sp.id = p_profile_id and sp.assistant_person_id = p_person_id)
    or exists (select 1 from speaker_contact c
                where c.profile_id = p_profile_id and c.person_id = p_person_id and c.has_access)
  )
$$;
