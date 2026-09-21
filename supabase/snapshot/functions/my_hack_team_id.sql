create or replace function my_hack_team_id(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select m.team_id from hack_team_member m join hack_team t on t.id = m.team_id
   where m.person_id = current_person_id() and t.edition_id = hack_edition(p_edition_id)
   limit 1
$$;
