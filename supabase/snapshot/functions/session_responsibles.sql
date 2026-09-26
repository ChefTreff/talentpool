create or replace function session_responsibles(p_event_id uuid)
 RETURNS TABLE(session_id uuid, owner_person_id uuid, owner_name text, derived_person_ids uuid[], derived_names text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_editor boolean;
begin
  if not coalesce(can_search_board(p_event_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_editor := coalesce(is_programme_editor(p_event_id), false);
  return query
    select se.id, se.owner_person_id,
           (select nullif(btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')), '')
              from person o where o.id = se.owner_person_id),
           d.ids,
           (select coalesce(array_agg(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                                      order by p.last_name, p.first_name), '{}'::text[])
              from person p where p.id = any(d.ids))
      from session se
      join slot sl on sl.id = se.slot_id
      cross join lateral (select slot_stage_leads(sl.id) as ids) d
     where se.event_id = p_event_id
       and (v_editor or can_edit_slot(sl.id));
end $$;
