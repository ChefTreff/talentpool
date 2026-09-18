create or replace function catering_people(p_edition_id uuid)
 RETURNS TABLE(person_id uuid, audience text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select sp.person_id, 'speaker'
    from speaker_profile sp join person p on p.id = sp.person_id and p.deleted_at is null
   where sp.edition_id = p_edition_id and speaker_is_confirmed(sp.pipeline_status)
  union
  select vp.person_id, 'volunteer'
    from volunteer_profile vp join person p on p.id = vp.person_id and p.deleted_at is null
   where vp.edition_id = p_edition_id and vp.status = 'accepted'
$$;
