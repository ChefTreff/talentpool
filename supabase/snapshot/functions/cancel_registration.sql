create or replace function cancel_registration(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id();
begin
  update registration set status = 'cancelled'
   where person_id = v_pid and session_id = p_session_id and status in ('confirmed','waitlisted','applied');
  if not found then
    raise exception 'registration_not_found' using errcode = 'P0002';
  end if;
end $$;
