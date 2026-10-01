create or replace function can_write_hack_submission(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select current_person_id() is not null and exists (
    select 1 from hack_team t join hack_team_member m on m.team_id = t.id
     where t.id = p_team_id and t.status <> 'withdrawn' and m.person_id = current_person_id())
$$;
