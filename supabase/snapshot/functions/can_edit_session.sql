create or replace function can_edit_session(p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select exists (
    select 1
    from session se
    where se.id = p_session_id
      and (
           is_programme_editor(se.event_id)
        or (se.slot_id is not null and can_edit_slot(se.slot_id))
        or (se.slot_id is null and se.created_by = current_person_id()
            and (has_role('speaker_manager') or has_role('standbuehne_editor')))
      )
  )
$$;
