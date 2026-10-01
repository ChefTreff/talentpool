create or replace function can_manage_hack_dataset(p_challenge_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select current_person_id() is not null and (
    is_hack_team()
    or exists (select 1 from hack_challenge c
                where c.id = p_challenge_id and c.org_id is not null and partner_can_edit(c.org_id)))
$$;
