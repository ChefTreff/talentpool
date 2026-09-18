create or replace function set_primary_email(p_email_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare v_pid uuid := current_person_id();
begin
  if v_pid is null then
    raise exception 'no person for current user' using errcode = '28000';
  end if;
  if not exists (select 1 from person_email where id = p_email_id and person_id = v_pid) then
    raise exception 'email % not found for current person', p_email_id;
  end if;
  update person_email set is_primary = (id = p_email_id) where person_id = v_pid;
end $$;
