create or replace function my_speaker_profile_id(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select sp.id from speaker_profile sp
  where (sp.person_id = current_person_id() or is_speaker_assistant(sp.id, current_person_id()))
    and (p_edition_id is null or sp.edition_id = p_edition_id)
  order by (sp.person_id = current_person_id()) desc, sp.created_at desc limit 1
$$;
