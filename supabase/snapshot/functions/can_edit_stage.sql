create or replace function can_edit_stage(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
    select 1
    from stage st
    join event ev on ev.id = st.event_id
    join active_roles() ra on true
    where st.id = p_stage_id
      and (
           (ra.role in ('admin','programme_team') and ra.scope_type = 'global')
        or (ra.role in ('admin','programme_team') and ra.scope_type = 'edition' and ra.edition_id in (ev.id, ev.edition_id))
        or (ra.role in ('speaker_manager','standbuehne_editor') and ra.scope_type = 'stage' and ra.scope_id = st.id)
        or (ra.role = 'standbuehne_editor' and ra.scope_type = 'org' and st.type = 'partner_booth'
            and st.partner_org_id is not null and ra.scope_id = st.partner_org_id)
      )
  )
$$;
