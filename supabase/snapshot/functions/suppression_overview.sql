create or replace function suppression_overview()
 RETURNS TABLE(reason text, entries bigint, first_at timestamp with time zone, last_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('suppression') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select s.reason, count(*), min(s.created_at), max(s.created_at)
      from suppression s group by s.reason order by count(*) desc, s.reason;
end $$;
