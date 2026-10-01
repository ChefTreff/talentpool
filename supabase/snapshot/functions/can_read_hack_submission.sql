create or replace function can_read_hack_submission(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select current_person_id() is not null
     and (can_write_hack_submission(p_team_id) or can_judge_hack_team(p_team_id))
$$;
