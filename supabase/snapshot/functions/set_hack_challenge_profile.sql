create or replace function set_hack_challenge_profile(p_challenge_id uuid, p_study_fields text[], p_skills text[], p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_c hack_challenge; v_k text;
        v_fields text[] := coalesce((select array_agg(distinct btrim(x)) from unnest(p_study_fields) x where btrim(x) <> ''), '{}');
        v_skills text[] := coalesce((select array_agg(distinct btrim(x)) from unnest(p_skills) x where btrim(x) <> ''), '{}');
        v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_c from hack_challenge where id = p_challenge_id for update;
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
  if not (is_hack_team() or (v_c.org_id is not null and partner_can_edit(v_c.org_id))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  foreach v_k in array v_fields loop
    if not is_vocab_key('study_field', v_k) then raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'target_study_fields'; end if;
  end loop;
  foreach v_k in array v_skills loop
    if not is_vocab_key('skill', v_k) then raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'target_skills'; end if;
  end loop;
  if cardinality(v_fields) > 8 or cardinality(v_skills) > 8 then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'max 8';
  end if;
  if length(v_text) > 500 then raise exception 'too_long' using errcode = '22023', detail = '500'; end if;

  update hack_challenge
     set target_study_fields = v_fields, target_skills = v_skills, target_profile = v_text, updated_at = now()
   where id = p_challenge_id;
  perform log_audit('hack.challenge_profile', 'hack_challenge', p_challenge_id::text,
    jsonb_build_object('fields', v_c.target_study_fields, 'skills', v_c.target_skills, 'text', v_c.target_profile),
    jsonb_build_object('fields', v_fields, 'skills', v_skills, 'text', v_text));
end $$;
