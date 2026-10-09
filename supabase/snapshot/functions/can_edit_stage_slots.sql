create or replace function can_edit_stage_slots(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select can_edit_stage(p_stage_id)
      or exists (
        select 1
          from stage st
          join active_roles() ra on true
         where st.id = p_stage_id
           and ra.role = 'standbuehne_editor' and ra.scope_type = 'org'
           and st.kind = 'branded' and st.partner_org_id is not null and ra.scope_id = st.partner_org_id)
$$;
