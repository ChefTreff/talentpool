create or replace function speaker_activity_assignee_ok(p_person uuid, p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(
    p_person = current_person_id()
    or exists (select 1 from speaker_profile sp where sp.id = p_profile_id and sp.owner_person_id = p_person)
    or exists (
      select 1 from role_assignment ra join speaker_profile sp on sp.id = p_profile_id
       where ra.person_id = p_person
         and ra.role in ('speaker_manager', 'admin', 'area_lead_speaker', 'programme_team')
         and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
         and (ra.scope_type = 'global' or ra.edition_id = sp.edition_id)),
    false)
$$;
