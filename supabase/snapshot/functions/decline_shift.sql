create or replace function decline_shift(p_assignment_id uuid, p_reason text DEFAULT NULL::text)
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
  if v_a.status not in ('assigned', 'confirmed', 'waitlisted') then raise exception 'not_assigned' using errcode = 'P0001', detail = v_a.status; end if;
  update shift_assignment set status = 'declined', declined_at = now(),
         decline_reason = nullif(btrim(coalesce(p_reason, '')), '') where id = p_assignment_id;
  perform promote_shift_waitlist(v_a.shift_id);
  perform log_audit('volunteer.decline_shift', 'shift_assignment', p_assignment_id::text,
                    jsonb_build_object('status', v_a.status), jsonb_build_object('reason', p_reason));
end $$;
