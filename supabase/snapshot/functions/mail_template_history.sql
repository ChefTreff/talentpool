create or replace function mail_template_history(p_key text, p_locale text, p_limit integer DEFAULT 10)
 RETURNS TABLE(changed_at timestamp with time zone, changed_by text, subject_before text, body_before text, version_after integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.created_at,
           (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
              from person p where p.id = a.actor_person_id),
           a.before->>'subject', a.before->>'body_md', (a.after->>'version')::integer
      from audit_log a
     where a.action = 'mail_template.upsert'
       and a.object_id = p_key || '/' || p_locale
       and a.before is not null
     order by a.created_at desc, a.id desc
     limit greatest(1, least(coalesce(p_limit, 10), 50));
end $$;
