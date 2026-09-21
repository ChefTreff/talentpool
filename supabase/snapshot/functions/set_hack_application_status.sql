create or replace function set_hack_application_status(p_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('applied', 'accepted', 'declined') then
    raise exception 'invalid_status' using errcode = '22023', detail = p_status;
  end if;
  update hack_application set status = p_status, note = nullif(btrim(p_note), ''),
         decided_at = now(), decided_by = current_person_id()
   where id = p_id;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  perform log_audit('hack.application_' || p_status, 'hack_application', p_id::text, null, null);
end $$;
