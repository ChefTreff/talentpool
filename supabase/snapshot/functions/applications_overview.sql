create or replace function applications_overview(p_event_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(session_id uuid, event_id uuid, title_de text, title_en text, start_at timestamp with time zone, end_at timestamp with time zone, stage_name text, capacity integer, publish_status text, application_deadline timestamp with time zone, released boolean, counts jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select se.id, se.event_id, se.title_de, se.title_en, sl.start_at, sl.end_at, st.name, se.capacity,
         se.publish_status, se.application_deadline,
         exists (select 1 from decision_release d where d.session_id = se.id),
         coalesce((select jsonb_object_agg(x.status, x.n)
                   from (select a.status, count(*) as n from application a where a.session_id = se.id group by a.status) x),
                  '{}'::jsonb)
  from session se
  left join slot sl on sl.id = se.slot_id
  left join stage st on st.id = sl.stage_id
  where se.access_mode = 'application'
    and (p_event_id is null or se.event_id = p_event_id)
    and can_decide_session(se.id)
  order by sl.start_at nulls last, se.title_de
$$;
