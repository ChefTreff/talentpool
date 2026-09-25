create or replace function partner_manages_stage_guest(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (select 1 from speaker_profile sp
                  where sp.id = p_profile_id and sp.stage_guest and sp.created_by_org_id is not null
                    and partner_can_edit(sp.created_by_org_id))
$$;
