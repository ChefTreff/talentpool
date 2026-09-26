create or replace function can_search_board(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(
    is_programme_editor(p_event_id)
    -- PORT3 / L2: Stage Leads suchen nur, wo sie eine Bühne, einen Tag oder
    -- einen Slot im Event haben — nicht mehr global oder für die Edition.
    or exists (
      select 1
        from active_roles() ra
        join stage st on st.id = scope_stage_id(ra.scope_type, ra.scope_id)
       where ra.role = 'speaker_manager'
         and st.event_id = p_event_id),
    false)
$$;
