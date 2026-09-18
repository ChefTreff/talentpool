create or replace function can_edit_slot(p_slot_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
    select 1
    from slot s
    join stage st on st.id = s.stage_id
    join event ev on ev.id = st.event_id
    left join stage_day sd on sd.stage_id = s.stage_id and sd.event_day_id = s.event_day_id
    join active_roles() ra on true
    where s.id = p_slot_id
      and (
           (ra.role in ('admin','programme_team') and ra.scope_type = 'global')
        or (ra.role in ('admin','programme_team') and ra.scope_type = 'edition' and ra.edition_id in (ev.id, ev.edition_id))
        or (ra.role in ('speaker_manager','standbuehne_editor') and ra.scope_type = 'stage' and ra.scope_id = s.stage_id)
        or (ra.role = 'standbuehne_editor' and ra.scope_type = 'org' and st.partner_org_id is not null and ra.scope_id = st.partner_org_id)
        or (ra.role = 'speaker_manager' and ra.scope_type = 'stage_day' and ra.scope_id = sd.id)
        or (ra.role = 'speaker_manager' and ra.scope_type = 'slot' and ra.scope_id = s.id)
      )
  )
$$;
