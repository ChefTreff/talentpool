create or replace function apply_hackathon(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid; v_id uuid; v_skill text;
        v_github text; v_website text; v_behance text; v_tracks text[]; v_track text;
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

  -- Track-Wunsch (HACK-010): 1–3 Tracks, ohne Doppelte, Reihenfolge wie angegeben.
  v_tracks := coalesce((select array_agg(x.v order by x.o)
                          from (select distinct on (btrim(value)) btrim(value) as v, ord as o
                                  from jsonb_array_elements_text(
                                         case when jsonb_typeof(p_data->'track_prefs') = 'array'
                                              then p_data->'track_prefs' else '[]'::jsonb end)
                                       with ordinality as t(value, ord)
                                 where btrim(value) <> ''
                                 order by btrim(value), ord) x), '{}');
  foreach v_track in array v_tracks loop
    if not is_vocab_key('hack_track', v_track) then
      raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'track_prefs';
    end if;
  end loop;
  if cardinality(v_tracks) > 3 then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'track_prefs';
  end if;
  if cardinality(v_tracks) = 0
     and exists (select 1 from vocab_term where vocabulary = 'hack_track' and active) then
    raise exception 'track_pref_missing' using errcode = '22023';
  end if;

  -- Portfolio-Links (HACK-007): nur https, je Feld der erwartete Dienst; leer = nicht gesetzt.
  v_github := nullif(btrim(p_data->>'github_url'), '');
  v_website := nullif(btrim(p_data->>'website_url'), '');
  v_behance := nullif(btrim(p_data->>'behance_url'), '');
  if v_github is not null and v_github !~* '^https://(www\.)?github\.com/[^\s]+$' then
    raise exception 'invalid_url' using errcode = '22023', detail = 'github_url';
  end if;
  if v_website is not null and (v_website !~* '^https://[^\s/]+\.[^\s]+$' or length(v_website) > 300) then
    raise exception 'invalid_url' using errcode = '22023', detail = 'website_url';
  end if;
  if v_behance is not null and v_behance !~* '^https://(www\.)?behance\.net/[^\s]+$' then
    raise exception 'invalid_url' using errcode = '22023', detail = 'behance_url';
  end if;

  insert into hack_application (person_id, edition_id, skills, motivation, team_pref, github_url, website_url, behance_url, track_prefs)
  values (v_me, v_ed,
          coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_data->'skills') as t(value)), '{}'),
          nullif(btrim(p_data->>'motivation'), ''), nullif(btrim(p_data->>'team_pref'), ''),
          v_github, v_website, v_behance, v_tracks)
  on conflict (person_id, edition_id) do update set
    skills = excluded.skills, motivation = excluded.motivation, team_pref = excluded.team_pref,
    github_url = excluded.github_url, website_url = excluded.website_url, behance_url = excluded.behance_url,
    track_prefs = excluded.track_prefs,
    status = case when hack_application.status = 'withdrawn' then 'applied' else hack_application.status end
  returning id into v_id;

  perform log_audit('hack.applied', 'hack_application', v_id::text, null, null);
  return v_id;
end $$;
