create or replace function submit_feedback(p_data jsonb, p_anonymous boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_n integer; v_format text := btrim(coalesce(p_data->>'format', ''));
        v_kind text := nullif(btrim(coalesce(p_data->>'kind', '')), '');
        v_reason text := nullif(btrim(coalesce(p_data->>'main_reason', '')), '');
        v_intent text := nullif(btrim(coalesce(p_data->>'return_intent', '')), '');
        v_body text := nullif(btrim(coalesce(p_data->>'body', '')), '');
        v_memo text := nullif(btrim(coalesce(p_data->>'memorable', '')), '');
        v_ratings jsonb := '{}'::jsonb; v_key text; v_val integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not is_vocab_key('feedback_format', v_format) then raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'format'; end if;
  if v_kind is not null and not is_vocab_key('feedback_kind', v_kind) then raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'kind'; end if;
  if v_reason is not null and not is_vocab_key('feedback_reason', v_reason) then raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'main_reason'; end if;
  if v_intent is not null and v_intent not in ('yes', 'unsure', 'no') then raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'return_intent'; end if;
  if length(v_body) > 2000 or length(v_memo) > 1000 then raise exception 'too_long' using errcode = '22023'; end if;

  -- Bewertungen 1–5 nur beim Summit, nur die sechs Fragen aus FLS26.
  if jsonb_typeof(p_data->'ratings') = 'object' then
    for v_key in select jsonb_object_keys(p_data->'ratings') loop
      if v_key not in ('overall', 'programme', 'expo', 'masterclasses', 'app', 'side_events') then
        raise exception 'invalid_rating' using errcode = '22023', detail = v_key;
      end if;
      begin v_val := (p_data->'ratings'->>v_key)::integer; exception when others then v_val := null; end;
      if v_val is null then continue; end if;
      if v_val < 1 or v_val > 5 then raise exception 'invalid_rating' using errcode = '22023', detail = v_key; end if;
      v_ratings := v_ratings || jsonb_build_object(v_key, v_val);
    end loop;
  end if;
  if v_format <> 'summit' then v_ratings := '{}'::jsonb; v_intent := null; v_reason := null; v_memo := null; end if;
  if v_body is null and v_ratings = '{}'::jsonb and v_memo is null then
    raise exception 'missing_field' using errcode = '22023', detail = 'body';
  end if;

  -- Tageslimit: Zähler getrennt vom Text, ohne Uhrzeit.
  insert into feedback_quota (person_id, day, n) values (v_me, current_date, 1)
  on conflict (person_id, day) do update set n = feedback_quota.n + 1
  returning n into v_n;
  if v_n > 5 then raise exception 'feedback_limit' using errcode = 'P0001', detail = '5'; end if;

  insert into feedback_entry (person_id, format, kind, ratings, return_intent, main_reason, memorable, body)
  values (case when coalesce(p_anonymous, true) then null else v_me end,
          v_format, v_kind, v_ratings, v_intent, v_reason, v_memo, v_body);
  -- Bewusst kein Audit-Eintrag: er nennte Person und Uhrzeit und höbe die Anonymität auf.
end $$;
