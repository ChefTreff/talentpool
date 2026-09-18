create or replace function is_programme_editor(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
    select 1
    from event ev
    join active_roles() ra on true
    where ev.id = p_event_id
      and (
           (ra.role in ('admin','programme_team') and ra.scope_type = 'global')
        or (ra.role in ('admin','programme_team') and ra.scope_type = 'edition'
            and ra.edition_id in (ev.id, ev.edition_id))
      )
  )
$$;
