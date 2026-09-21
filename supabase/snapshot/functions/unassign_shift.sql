create or replace function unassign_shift(p_assignment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a shift_assignment;
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_a from shift_assignment where id = p_assignment_id;
  if not found then raise exception 'assignment_not_found' using errcode = 'P0002'; end if;
  delete from shift_assignment where id = p_assignment_id;
  perform promote_shift_waitlist(v_a.shift_id);
  perform log_audit('volunteer.unassign_shift', 'shift_assignment', p_assignment_id::text,
                    jsonb_build_object('shift_id', v_a.shift_id, 'person_id', v_a.person_id), null);
end $$;
