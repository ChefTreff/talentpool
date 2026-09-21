create or replace function purge_kb_questions(p_days integer DEFAULT 90)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer;
begin
  if not (auth.uid() is null or has_role('admin') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from kb_question_log where created_at < now() - make_interval(days => greatest(1, p_days));
  get diagnostics v_n = row_count;
  delete from kb_rate_limit where window_start < now() - interval '24 hours';
  return v_n;
end $$;
