create or replace function set_hack_metric(p_team_id uuid, p_value numeric, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid; v_mode text; v_old numeric;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select t.edition_id, c.judging_mode into v_ed, v_mode
    from hack_team t left join hack_challenge c on c.id = t.challenge_id where t.id = p_team_id;
  if not found then raise exception 'team_not_found' using errcode = 'P0002'; end if;
  -- Eigenes Team oder Jury dieser Challenge (can_judge_hack_team schließt das Hack-Team ein).
  if p_team_id is distinct from my_hack_team_id(v_ed) and not can_judge_hack_team(p_team_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_mode is distinct from 'metric' then raise exception 'not_metric_challenge' using errcode = '22023'; end if;
  if p_value is null or p_value = 'NaN'::numeric or abs(p_value) > 1e12 then
    raise exception 'invalid_metric' using errcode = '22023';
  end if;
  if length(p_note) > 500 then raise exception 'invalid_metric' using errcode = '22023', detail = 'note'; end if;

  select value into v_old from hack_metric_result where team_id = p_team_id;
  insert into hack_metric_result (team_id, value, note, entered_by, entered_at)
  values (p_team_id, p_value, nullif(btrim(p_note), ''), v_me, now())
  on conflict (team_id) do update set
    value = excluded.value, note = excluded.note, entered_by = v_me, entered_at = now(),
    -- Ein neuer Wert muss neu bestätigt werden.
    confirmed_by = case when hack_metric_result.value = excluded.value then hack_metric_result.confirmed_by end,
    confirmed_at = case when hack_metric_result.value = excluded.value then hack_metric_result.confirmed_at end;
  perform log_audit('hack.metric_set', 'hack_team', p_team_id::text,
                    jsonb_build_object('value', v_old), jsonb_build_object('value', p_value));
end $$;
