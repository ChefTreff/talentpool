create or replace function board_session_return(p_session_id uuid)
 RETURNS TABLE(note text, returned_at timestamp with time zone, returned_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_event uuid;
begin
  select se.event_id into v_event from session se where se.id = p_session_id;
  if v_event is null then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if not coalesce(is_programme_editor(v_event), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select r.note, r.returned_at,
           (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
              from person p where p.id = r.returned_by)
      from partner_session_return r
     where r.session_id = p_session_id;
end $$;
