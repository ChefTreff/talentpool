create or replace function kb_question_report(p_days integer DEFAULT 30)
 RETURNS TABLE(audience text, language text, question text, hit boolean, asked integer, last_asked timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_role('admin') or can_edit_kb_all(array['partner','speaker','talent','volunteer','hackathon'])) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select q.audience, q.language, lower(btrim(q.question)), q.hit,
           count(*)::integer, max(q.created_at)
      from kb_question_log q
     where q.created_at > now() - make_interval(days => greatest(1, p_days))
     group by q.audience, q.language, lower(btrim(q.question)), q.hit
     order by q.hit, count(*) desc, max(q.created_at) desc;
end $$;
