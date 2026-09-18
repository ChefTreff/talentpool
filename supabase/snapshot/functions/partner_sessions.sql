create or replace function partner_sessions(p_org_id uuid)
 RETURNS TABLE(id uuid, event_id uuid, event_slug text, title_de text, title_en text, format text, access_mode text, publish_status text, capacity integer, application_deadline timestamp with time zone, start_at timestamp with time zone, end_at timestamp with time zone, stage_name text, released boolean, counts jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select se.id, se.event_id, ev.slug, se.title_de, se.title_en, se.format, se.access_mode, se.publish_status, se.capacity, se.application_deadline,
           sl.start_at, sl.end_at, st.name, decisions_released(se.id),
           (select jsonb_build_object(
              'total', count(*),
              'applied', count(*) filter (where a.status = 'applied'),
              'shortlisted', count(*) filter (where a.status = 'shortlisted'),
              'accepted', count(*) filter (where a.status in ('accepted', 'promoted')),
              'waitlisted', count(*) filter (where a.status = 'waitlisted'),
              'confirmed', count(*) filter (where a.status = 'confirmed'),
              'declined', count(*) filter (where a.status = 'declined'))
            from application a where a.session_id = se.id)
    from session se
    join event ev on ev.id = se.event_id
    left join slot sl on sl.id = se.slot_id
    left join stage st on st.id = sl.stage_id
    where se.host_org_id = p_org_id
    order by sl.start_at nulls last, se.created_at;
end $$;
