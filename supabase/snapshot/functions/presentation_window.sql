create or replace function presentation_window(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select jsonb_build_object(
    'deadline_at', d.due_at,
    'slot_start', sl.start_at,
    'effective_due', least(d.due_at, sl.start_at - interval '48 hours'),
    'late_now', now() > least(d.due_at, sl.start_at - interval '48 hours'),
    'accepts_late', true
  )
  from session se
  join event e on e.id = se.event_id
  left join slot sl on sl.id = se.slot_id
  left join deadline d on d.key = 'presentation_upload' and d.edition_id = coalesce(e.edition_id, e.id)
  where se.id = p_session_id
$$;
