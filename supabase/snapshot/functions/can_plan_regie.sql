create or replace function can_plan_regie(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select is_production_team() or exists (
    select 1
      from stage st
      join event ev on ev.id = st.event_id
      join active_roles() ra on true
     where st.id = p_stage_id
       and ra.role in ('admin', 'programme_team')
       and (ra.scope_type = 'global'
            or (ra.scope_type = 'edition' and ra.edition_id in (ev.id, ev.edition_id))))
$$;
