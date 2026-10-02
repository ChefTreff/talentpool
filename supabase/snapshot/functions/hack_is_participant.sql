create or replace function hack_is_participant(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select current_person_id() is not null and (
    exists (select 1 from hack_application a where a.person_id = current_person_id()
             and a.edition_id = hack_edition(p_edition_id) and a.status = 'accepted')
    or my_hack_team_id(hack_edition(p_edition_id)) is not null)
$$;
