create or replace function luma_lead_stats()
 RETURNS TABLE(total integer, without_login integer, claimed integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_view_community_events() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select count(*)::integer,
           (count(*) filter (where p.tier = 'lead' and p.auth_user_id is null))::integer,
           (count(*) filter (where p.auth_user_id is not null))::integer
      from person p
     where p.source_first = 'luma' and p.deleted_at is null;
end $$;
