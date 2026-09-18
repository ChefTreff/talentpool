create or replace function is_application_team(p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
    select 1 from session se join event ev on ev.id = se.event_id
    where se.id = p_session_id
      and (has_role('admin')
           or has_role('programme_team', 'edition', null, ev.edition_id)
           or has_role('programme_team', 'edition', null, ev.id)
           or has_role('area_lead_talent'))
  )
$$;
