create or replace function can_read_hack_dataset(p_challenge_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select current_person_id() is not null and (
    can_manage_hack_dataset(p_challenge_id)
    or exists (select 1 from hack_challenge c
                where c.id = p_challenge_id and c.org_id is not null and is_partner_of(c.org_id))
    or exists (select 1 from hack_team t join hack_team_member m on m.team_id = t.id
                where t.challenge_id = p_challenge_id and t.status <> 'withdrawn'
                  and m.person_id = current_person_id()))
$$;
