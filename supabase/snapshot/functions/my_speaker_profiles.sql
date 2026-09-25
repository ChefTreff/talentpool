create or replace function my_speaker_profiles()
 RETURNS TABLE(profile_id uuid, edition_id uuid, edition_name text, first_name text, last_name text, own boolean, selected boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select sp.id, sp.edition_id, e.name, p.first_name, p.last_name,
         sp.person_id = current_person_id(),
         sp.id is not distinct from my_speaker_profile_id()
    from speaker_profile sp
    join person p on p.id = sp.person_id and p.deleted_at is null
    join event e on e.id = sp.edition_id
   where current_person_id() is not null
     and (sp.person_id = current_person_id() or is_speaker_assistant(sp.id, current_person_id()))
   order by (sp.person_id = current_person_id()) desc, e.start_date desc nulls last,
            p.last_name nulls last, p.first_name nulls last
$$;
