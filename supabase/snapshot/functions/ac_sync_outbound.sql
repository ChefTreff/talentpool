create or replace function ac_sync_outbound(p_limit integer DEFAULT 40)
 RETURNS TABLE(person_id uuid, email text, first_name text, last_name text, preferred_language text, topics text[], ac_contact_id text, previous_topics text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.person_id, r.email, r.first_name, r.last_name, r.preferred_language, r.topics, r.ac_contact_id, r.previous_topics
      from ac_outbound_rows() r
     order by r.synced_at nulls first, r.person_id
     limit greatest(least(coalesce(p_limit, 40), 200), 1);
end $$;
