create or replace function release_decisions(p_session_id uuid, p_note text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_hours integer; v_n integer;
begin
  if not (has_role('admin') or has_role('programme_team') or has_role('area_lead_talent')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select confirm_by_hours into v_hours from session where id = p_session_id;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  update application
     set confirm_by = now() + make_interval(hours => v_hours)
   where session_id = p_session_id and status in ('accepted', 'promoted') and confirm_by is null;
  get diagnostics v_n = row_count;
  insert into decision_release (session_id, released_by, note)
    values (p_session_id, current_person_id(), p_note)
  on conflict (session_id) do nothing;
  perform log_audit('application.release', 'session', p_session_id::text, null, jsonb_build_object('accepted', v_n));
  return v_n;
end $$;
