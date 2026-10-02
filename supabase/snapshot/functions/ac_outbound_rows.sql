create or replace function ac_outbound_rows()
 RETURNS TABLE(person_id uuid, email text, first_name text, last_name text, preferred_language text, topics text[], ac_contact_id text, previous_topics text[], synced_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  with cur as (
    select i.person_id, array_agg(i.term_key order by i.term_key) as topics
      from person_interest i
      join vocab_term v on v.vocabulary = 'notification_topic' and v.key = i.term_key and v.active
     where i.vocabulary = 'notification_topic'
     group by i.person_id)
  select p.id, e.email::text, p.first_name, p.last_name, p.preferred_language,
         cur.topics, a.ac_contact_id, coalesce(a.topics, '{}'), a.synced_at
    from cur
    join person p on p.id = cur.person_id
    join person_email e on e.person_id = p.id and e.is_primary
    left join ac_contact a on a.person_id = p.id
   where notification_reachable(p.id) and (a.person_id is null or a.topics is distinct from cur.topics)
$$;
