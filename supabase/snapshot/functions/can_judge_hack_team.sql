create or replace function can_judge_hack_team(p_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select is_hack_team() or exists (
    select 1 from hack_team t join hack_challenge c on c.id = t.challenge_id
     where t.id = p_team_id and c.org_id is not null
       and has_role('hackathon_partner') and is_member_of_org(c.org_id))
$$;
