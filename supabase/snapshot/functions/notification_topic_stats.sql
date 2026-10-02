create or replace function notification_topic_stats()
 RETURNS TABLE(topic text, chosen integer, reachable integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not coalesce(has_admin_section('notifications'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.key,
           (select count(*)::integer from person_interest i where i.vocabulary = 'notification_topic' and i.term_key = t.key),
           (select count(*)::integer from person_interest i
             where i.vocabulary = 'notification_topic' and i.term_key = t.key and notification_reachable(i.person_id))
      from vocab_term t
     where t.vocabulary = 'notification_topic'
     order by t.sort_order;
end $$;
