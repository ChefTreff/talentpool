create or replace function set_hack_challenge_judging(p_challenge_id uuid, p_mode text, p_metric_label text DEFAULT NULL::text, p_higher_better boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_old hack_challenge; v_label text := nullif(btrim(coalesce(p_metric_label, '')), '');
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_mode is null or p_mode not in ('jury', 'metric') then
    raise exception 'invalid_status' using errcode = '22023', detail = 'judging_mode';
  end if;
  if p_mode = 'metric' and v_label is null then
    raise exception 'metric_label_missing' using errcode = '22023';
  end if;
  if length(v_label) > 80 then raise exception 'metric_label_missing' using errcode = '22023'; end if;
  select * into v_old from hack_challenge where id = p_challenge_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update hack_challenge
     set judging_mode = p_mode,
         metric_label = case when p_mode = 'metric' then v_label end,
         metric_higher_better = coalesce(p_higher_better, true),
         updated_at = now()
   where id = p_challenge_id;
  perform log_audit('hack.challenge_judging', 'hack_challenge', p_challenge_id::text,
    jsonb_build_object('mode', v_old.judging_mode, 'metric', v_old.metric_label, 'higher', v_old.metric_higher_better),
    jsonb_build_object('mode', p_mode, 'metric', case when p_mode = 'metric' then v_label end,
                       'higher', coalesce(p_higher_better, true)));
end $$;
