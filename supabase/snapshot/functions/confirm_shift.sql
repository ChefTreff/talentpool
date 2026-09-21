create or replace function confirm_shift(p_assignment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id(); v_a shift_assignment;
begin
  if v_pid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_a from shift_assignment where id = p_assignment_id for update;
  if not found or v_a.person_id <> v_pid then raise exception 'assignment_not_found' using errcode = 'P0002'; end if;
  if v_a.status <> 'assigned' then raise exception 'not_assigned' using errcode = 'P0001', detail = v_a.status; end if;
  update shift_assignment set status = 'confirmed', confirmed_at = now() where id = p_assignment_id;
  perform log_audit('volunteer.confirm_shift', 'shift_assignment', p_assignment_id::text, null, null);
end $$;
