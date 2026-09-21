create or replace function kb_take_question_slot(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_uid uuid := auth.uid(); v_win timestamptz; v_hits integer;
begin
  if v_uid is null then raise exception 'not allowed' using errcode = '28000'; end if;
  v_win := date_trunc('hour', now());
  insert into kb_rate_limit (auth_user_id, window_start, hits) values (v_uid, v_win, 1)
  on conflict (auth_user_id, window_start) do update set hits = kb_rate_limit.hits + 1
  returning hits into v_hits;
  if v_hits > p_limit then
    raise exception 'rate_limited' using errcode = 'P0001', detail = p_limit::text;
  end if;
  return jsonb_build_object('used', v_hits, 'left', greatest(0, p_limit - v_hits));
end $$;
