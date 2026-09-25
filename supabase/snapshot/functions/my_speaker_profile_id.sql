create or replace function my_speaker_profile_id(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(
    -- SPK-071: die gemerkte Wahl — nur, solange das Recht noch besteht und die
    -- Edition passt. Sonst wie bisher.
    (select sp.id
       from speaker_portal_selection w
       join speaker_profile sp on sp.id = w.profile_id
      where w.person_id = current_person_id()
        and (sp.person_id = current_person_id() or is_speaker_assistant(sp.id, current_person_id()))
        and (p_edition_id is null or sp.edition_id = p_edition_id)),
    (select sp.id from speaker_profile sp
      where (sp.person_id = current_person_id() or is_speaker_assistant(sp.id, current_person_id()))
        and (p_edition_id is null or sp.edition_id = p_edition_id)
      order by (sp.person_id = current_person_id()) desc, sp.created_at desc limit 1))
$$;
