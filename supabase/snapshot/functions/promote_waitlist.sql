create or replace function promote_waitlist(p_session_id uuid, p_count integer DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_hours integer; v_n integer := 0; r record;
begin
  if not (has_role('admin') or has_role('programme_team') or has_role('area_lead_talent') or auth.uid() is null) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select confirm_by_hours into v_hours from session where id = p_session_id;
  for r in
    select id from application
    where session_id = p_session_id and status = 'waitlisted'
    order by rank nulls last, created_at
    limit p_count
  loop
    update application set status = 'promoted', confirm_by = now() + make_interval(hours => v_hours) where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
