create or replace function submit_hack(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_team uuid; v_id uuid; v_n integer; v_late boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_team := my_hack_team_id(nullif(p_data->>'edition_id', '')::uuid);
  if v_team is null then raise exception 'not_my_team' using errcode = 'P0001'; end if;

  select count(*) into v_n from hack_team_member where team_id = v_team;
  if v_n < 3 then
    raise exception 'team_too_small' using errcode = 'P0001', detail = v_n::text;
  end if;

  -- Frist je Challenge (HACK-011): danach geht die Abgabe noch, ist aber „verspätet“.
  v_late := hack_submission_is_late(v_team);

  insert into hack_submission (team_id, url, repo_url, notes, submitted_at, submitted_by, late)
  values (v_team, nullif(btrim(p_data->>'url'), ''), nullif(btrim(p_data->>'repo_url'), ''),
          nullif(btrim(p_data->>'notes'), ''), now(), v_me, v_late)
  on conflict (team_id) do update set
    url = excluded.url, repo_url = excluded.repo_url, notes = excluded.notes,
    submitted_at = now(), submitted_by = v_me, late = excluded.late, updated_at = now()
  returning id into v_id;

  perform log_audit('hack.submitted', 'hack_team', v_team::text, null, jsonb_build_object('late', v_late));
  return v_id;
end $$;
