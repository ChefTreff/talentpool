create or replace function delete_my_profile()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_pid uuid := current_person_id();
begin
  if v_pid is null then raise exception 'no person for current user' using errcode = '28000'; end if;
  perform anonymize_person(v_pid);
end $$;
