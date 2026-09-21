create or replace function mail_log_stats(p_days integer DEFAULT 30)
 RETURNS TABLE(status text, anzahl bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select m.status, count(*)
      from mail_log m
     where m.queued_at > now() - make_interval(days => greatest(1, p_days))
     group by m.status order by count(*) desc;
end $$;
