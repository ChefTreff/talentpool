create or replace function hack_is_captain(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (select 1 from hack_team_member m where m.team_id = p_team_id
                  and m.person_id = current_person_id() and m.is_captain)
$$;
