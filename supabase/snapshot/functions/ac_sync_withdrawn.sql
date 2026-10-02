create or replace function ac_sync_withdrawn(p_limit integer DEFAULT 40)
 RETURNS TABLE(person_id uuid, email text, ac_contact_id text, topics text[], action text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.person_id, r.email, r.ac_contact_id, r.topics, r.action
      from ac_withdrawn_rows() r
     order by r.synced_at, r.person_id
     limit greatest(least(coalesce(p_limit, 40), 200), 1);
end $$;
