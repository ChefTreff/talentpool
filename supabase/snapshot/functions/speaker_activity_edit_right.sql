create or replace function speaker_activity_edit_right(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce((
    select a.author_person_id = current_person_id() or is_speaker_team(sp.edition_id)
      from speaker_activity a join speaker_profile sp on sp.id = a.profile_id
     where a.id = p_id), false)
$$;
