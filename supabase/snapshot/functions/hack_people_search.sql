create or replace function hack_people_search(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(person_id uuid, first_name text, study_field text, skills text[], track_prefs text[], invited boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid := hack_edition(p_edition_id); v_team uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team := my_hack_team_id(v_ed);
  -- Nur wer in einem Team ist, sucht Personen.
  if v_team is null then raise exception 'not_participant' using errcode = '42501'; end if;
  return query
    select p.id, p.first_name, p.study_field, a.skills, a.track_prefs,
           exists (select 1 from hack_join_request r where r.team_id = v_team and r.person_id = p.id and r.status = 'pending')
      from hack_application a
      join person p on p.id = a.person_id and p.deleted_at is null
     where a.edition_id = v_ed and a.status = 'accepted' and a.seeking_team
       and not exists (select 1 from hack_team_member m where m.person_id = a.person_id and m.edition_id = v_ed)
     order by p.first_name;
end $$;
