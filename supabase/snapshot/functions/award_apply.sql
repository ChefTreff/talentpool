create or replace function award_apply(p_data jsonb, p_ip_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_ed uuid := award_current_edition(); v_hash text; v_id uuid; v_topics text[]; v_t text; v_feld text;
  v_email text := lower(btrim(coalesce(p_data->>'contact_email', '')));
  v_jahr text := nullif(btrim(coalesce(p_data->>'founded_year', '')), '');
  v_mitglieder text := nullif(btrim(coalesce(p_data->>'active_members', '')), '');
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Erwartete Zustände als Rückgabe, nicht als raise (Kopf: kein Statement im Fehlerprotokoll).
  if v_ed is null or not coalesce((select w.apply_open from award_windows(v_ed) w), false) then
    return jsonb_build_object('status', 'closed');
  end if;
  v_hash := award_hash(v_ed, p_ip_hash);
  if v_hash is null then return jsonb_build_object('status', 'invalid', 'field', 'source'); end if;

  foreach v_feld in array array['name', 'location', 'description', 'mission', 'project', 'contact_first_name', 'contact_last_name', 'contact_email'] loop
    if nullif(btrim(coalesce(p_data->>v_feld, '')), '') is null then
      return jsonb_build_object('status', 'invalid', 'field', v_feld);
    end if;
  end loop;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('status', 'invalid', 'field', 'contact_email');
  end if;
  if coalesce(p_data->>'privacy_consent', '') <> 'true' then
    return jsonb_build_object('status', 'invalid', 'field', 'privacy_consent');
  end if;
  if (v_jahr is not null and v_jahr !~ '^[0-9]{4}$') then return jsonb_build_object('status', 'invalid', 'field', 'founded_year'); end if;
  if (v_mitglieder is not null and v_mitglieder !~ '^[0-9]{1,7}$') then return jsonb_build_object('status', 'invalid', 'field', 'active_members'); end if;
  if jsonb_typeof(coalesce(p_data->'topics', '[]')) <> 'array' then return jsonb_build_object('status', 'invalid', 'field', 'topics'); end if;
  select coalesce(array_agg(distinct x), '{}') into v_topics from jsonb_array_elements_text(coalesce(p_data->'topics', '[]')) x;
  if cardinality(v_topics) = 0 then return jsonb_build_object('status', 'invalid', 'field', 'topics'); end if;
  foreach v_t in array v_topics loop
    if not exists (select 1 from vocab_term v where v.vocabulary = 'award_topic' and v.active and v.key = v_t) then
      return jsonb_build_object('status', 'invalid', 'field', 'topics');
    end if;
  end loop;

  if (select count(*) from award_application a where a.submitter_hash = v_hash and a.created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  begin
    insert into award_application (edition_id, name, topics, location, description, mission, project,
                                   contact_first_name, contact_last_name, contact_email, founded_year, active_members,
                                   website, university, notes, privacy_consent_at, source, submitter_hash)
    values (v_ed, btrim(p_data->>'name'), v_topics, btrim(p_data->>'location'), btrim(p_data->>'description'),
            btrim(p_data->>'mission'), btrim(p_data->>'project'), btrim(p_data->>'contact_first_name'),
            btrim(p_data->>'contact_last_name'), v_email, v_jahr::smallint, v_mitglieder::integer,
            nullif(btrim(coalesce(p_data->>'website', '')), ''),
            nullif(btrim(coalesce(p_data->>'university', '')), ''), nullif(btrim(coalesce(p_data->>'notes', '')), ''),
            now(), 'public', v_hash)
    returning id into v_id;
  exception when check_violation then
    return jsonb_build_object('status', 'invalid', 'field', 'length');
  end;
  perform log_audit('award.apply', 'award_application', v_id::text, null, jsonb_build_object('edition_id', v_ed));
  return jsonb_build_object('status', 'ok', 'id', v_id, 'edition_id', v_ed);
end $$;
