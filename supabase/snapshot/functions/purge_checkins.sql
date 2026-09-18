create or replace function purge_checkins()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  -- service_role (Housekeeping-Cron) oder Team.
  if auth.uid() is not null and not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  with weg as (
    delete from checkin c
     using event e
     where e.id = c.edition_id
       and e.end_date is not null
       and e.end_date < current_date - interval '30 days'
    returning c.id)
  select count(*)::integer into v_n from weg;
  if v_n > 0 then
    perform log_audit('checkin.purged', 'checkin', null, null, jsonb_build_object('rows', v_n));
  end if;
  return v_n;
end $$;
