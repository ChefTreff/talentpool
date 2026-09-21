create or replace function stage_editor_orgs(p_person_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(array_agg(distinct x), '{}'::uuid[]) from (
    select ra.scope_id as x from role_assignment ra
     where ra.person_id = p_person_id and ra.role = 'standbuehne_editor' and ra.scope_type = 'org' and ra.scope_id is not null
       and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
    union
    select st.partner_org_id from role_assignment ra join stage st on st.id = ra.scope_id
     where ra.person_id = p_person_id and ra.role = 'standbuehne_editor' and ra.scope_type = 'stage' and st.partner_org_id is not null
       and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())
  ) s
$$;
