create or replace function kb_log_question(p_audience text, p_language text, p_question text, p_article_ids uuid[] DEFAULT '{}'::uuid[], p_hit boolean DEFAULT false, p_duration_ms integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_uid uuid := auth.uid(); v_ok boolean;
begin
  if v_uid is null then raise exception 'not allowed' using errcode = '28000'; end if;
  update kb_rate_limit set logged = logged + 1
   where auth_user_id = v_uid and window_start = date_trunc('hour', now()) and logged < hits
  returning true into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'no_slot' using errcode = 'P0001';
  end if;
  insert into kb_question_log (audience, language, question, article_ids, hit, duration_ms)
  values (p_audience, coalesce(nullif(p_language, ''), 'de'), left(btrim(p_question), 500),
          coalesce(p_article_ids, '{}'), coalesce(p_hit, false), p_duration_ms);
end $$;
