create or replace function set_hack_score(p_team_id uuid, p_criteria jsonb, p_note text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_crit jsonb; v_f jsonb;
        v_sum numeric := 0; v_weight numeric := 0; v_total numeric; v_points numeric;
begin
  if not is_hack_judge() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(c.criteria, '[]'::jsonb) into v_crit
    from hack_team t left join hack_challenge c on c.id = t.challenge_id where t.id = p_team_id;
  if not found then raise exception 'team_not_found' using errcode = 'P0002'; end if;
  if not can_judge_hack_team(p_team_id) then raise exception 'not allowed' using errcode = '42501'; end if;

  for v_f in select * from jsonb_array_elements(v_crit) loop
    v_points := nullif(p_criteria->>(v_f->>'key'), '')::numeric;
    if v_points is not null then
      if v_points < 0 or v_points > 10 then
        raise exception 'invalid_score' using errcode = '22023', detail = v_f->>'key';
      end if;
      v_sum := v_sum + v_points * coalesce((v_f->>'weight')::numeric, 0);
      v_weight := v_weight + coalesce((v_f->>'weight')::numeric, 0);
    end if;
  end loop;
  v_total := case when v_weight > 0 then round(v_sum / v_weight, 2) else null end;

  insert into hack_judging_score (team_id, judge_id, criteria, total, note)
  values (p_team_id, v_me, coalesce(p_criteria, '{}'::jsonb), v_total, nullif(btrim(p_note), ''))
  on conflict (team_id, judge_id) do update set
    criteria = excluded.criteria, total = excluded.total, note = excluded.note, updated_at = now();

  perform log_audit('hack.scored', 'hack_team', p_team_id::text, null, jsonb_build_object('total', v_total));
  return v_total;
end $$;
