create or replace function set_hack_team_looking(p_looking boolean, p_skills text[] DEFAULT '{}'::text[], p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_team uuid := my_hack_team_id(null); v_k text;
        v_skills text[] := coalesce((select array_agg(distinct btrim(x)) from unnest(p_skills) x where btrim(x) <> ''), '{}');
        v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_team is null then raise exception 'not_my_team' using errcode = 'P0001'; end if;
  if not hack_is_captain(v_team) then raise exception 'not_captain' using errcode = '42501'; end if;
  foreach v_k in array v_skills loop
    if not is_vocab_key('hack_skill', v_k) then raise exception 'invalid_skill' using errcode = '22023', detail = v_k; end if;
  end loop;
  if cardinality(v_skills) > 8 then raise exception 'invalid_skill' using errcode = '22023', detail = 'max 8'; end if;
  if length(v_note) > 200 then raise exception 'too_long' using errcode = '22023', detail = '200'; end if;
  update hack_team set looking = coalesce(p_looking, false), looking_skills = v_skills, looking_note = v_note, updated_at = now()
   where id = v_team;
  perform log_audit('hack.team_looking', 'hack_team', v_team::text, null,
                    jsonb_build_object('looking', coalesce(p_looking, false), 'skills', v_skills));
end $$;
