create or replace function can_search_board(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(
    is_programme_editor(p_event_id)
    or exists (
      select 1
        from event ev
        join active_roles() ra on true
       where ev.id = p_event_id
         and ra.role = 'speaker_manager'
         and (ra.scope_type = 'global'
              or (ra.scope_type = 'edition' and ra.edition_id in (ev.id, ev.edition_id))
              or (ra.scope_type = 'stage'
                  and exists (select 1 from stage st
                               where st.id = ra.scope_id and st.event_id = ev.id)))),
    false)
$$;
