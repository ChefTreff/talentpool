create or replace function apply_hackathon(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid; v_id uuid; v_skill text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(nullif(p_data->>'edition_id', '')::uuid);
  if v_ed is null then raise exception 'edition_not_found' using errcode = 'P0002'; end if;

  foreach v_skill in array coalesce(
    (select array_agg(value::text) from jsonb_array_elements_text(p_data->'skills') as t(value)), '{}') loop
    if not is_vocab_key('hack_skill', v_skill) then
      raise exception 'invalid_skill' using errcode = '22023', detail = v_skill;
    end if;
  end loop;

  insert into hack_application (person_id, edition_id, skills, motivation, team_pref)
  values (v_me, v_ed,
          coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_data->'skills') as t(value)), '{}'),
          nullif(btrim(p_data->>'motivation'), ''), nullif(btrim(p_data->>'team_pref'), ''))
  on conflict (person_id, edition_id) do update set
    skills = excluded.skills, motivation = excluded.motivation, team_pref = excluded.team_pref,
    status = case when hack_application.status = 'withdrawn' then 'applied' else hack_application.status end
  returning id into v_id;

  perform log_audit('hack.applied', 'hack_application', v_id::text, null, null);
  return v_id;
end $$;
