create or replace function ac_withdrawn_rows()
 RETURNS TABLE(person_id uuid, email text, ac_contact_id text, topics text[], action text, synced_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select a.person_id,
         (select e.email::text from person_email e where e.person_id = a.person_id and e.is_primary),
         a.ac_contact_id, a.topics,
         case
           when p.deleted_at is not null
             or exists (select 1 from person_email e join suppression s on s.email_hash = email_hash(e.email::text)
                         where e.person_id = a.person_id and e.is_primary) then 'delete'
           when not notification_reachable(a.person_id) then 'unsubscribe'
           else 'untag'
         end,
         a.synced_at
    from ac_contact a
    join person p on p.id = a.person_id
   where not notification_reachable(a.person_id)
      or (a.topics <> '{}'                     -- ohne Themen nur einmal „untag“: danach steht der Stand auf leer
          and not exists (select 1 from person_interest i
                           join vocab_term v on v.vocabulary = 'notification_topic' and v.key = i.term_key and v.active
                          where i.person_id = a.person_id and i.vocabulary = 'notification_topic'))
$$;
