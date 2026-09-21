create or replace function hospitality_used(p_quota_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(case when q.kind = 'hotel'
                       then (select count(*) from hospitality_booking b where b.quota_id = q.id and b.status in ('requested', 'confirmed'))
                       else (select sum(b.guests) from hospitality_booking b where b.quota_id = q.id and b.status in ('requested', 'confirmed')) end, 0)::integer
  from hospitality_quota q where q.id = p_quota_id
$$;
