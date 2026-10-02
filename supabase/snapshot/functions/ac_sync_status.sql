create or replace function ac_sync_status()
 RETURNS TABLE(contacts integer, pending_out integer, pending_withdrawn integer, last_status text, last_at timestamp with time zone, last_stats jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not coalesce(has_admin_section('notifications'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select (select count(*)::integer from ac_contact),
           (select count(*)::integer from ac_outbound_rows()),
           (select count(*)::integer from ac_withdrawn_rows()),
           j.status, j.started_at, j.stats
      from (select 1) x
      left join lateral (select s.status, s.started_at, s.stats from integration.sync_job s
                          where s.system = 'activecampaign' order by s.started_at desc limit 1) j on true;
end $$;
