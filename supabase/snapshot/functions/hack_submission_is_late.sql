create or replace function hack_submission_is_late(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce((select now() > c.submission_deadline from hack_team t
                     join hack_challenge c on c.id = t.challenge_id where t.id = p_team_id), false)
$$;
