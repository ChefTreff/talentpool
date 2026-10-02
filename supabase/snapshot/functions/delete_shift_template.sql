create or replace function delete_shift_template(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_volunteer_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from shift_template where id = p_id;
  if not found then raise exception 'template_not_found' using errcode = 'P0002'; end if;
  perform log_audit('volunteer.delete_shift_template', 'shift_template', p_id::text, null, null);
end $$;
