create or replace function deadline_usage_count(p_edition_id uuid, p_key text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select (select count(*) from deliverable_template t where t.due_rule ->> 'deadline_key' = p_key)::integer
       + (select count(*) from speaker_task s where s.edition_id = p_edition_id and s.deadline_key = p_key)::integer
$$;
