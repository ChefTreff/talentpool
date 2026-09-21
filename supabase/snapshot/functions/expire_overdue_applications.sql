create or replace function expire_overdue_applications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  if not (auth.uid() is null or has_role('admin') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update application set status = 'expired'
   where status in ('accepted','promoted') and confirm_by is not null and confirm_by < now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;
