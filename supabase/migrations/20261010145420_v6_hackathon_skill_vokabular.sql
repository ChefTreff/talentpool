-- 0308 · Hackathon-Skills auf das Vokabular skill (K-94 Stufe 1 Teil B)
-- Angewendet von der Architektur-Session am 10.10.2026 als 20261010145420.
-- Anlass: Konrad 09.10. (K-94), Plan 10.10. Die Hackathon-Bewerbung und die Teamsuche führten ein eigenes Vokabular `hack_skill` (6 Einträge);
-- Profil, Wunschprofil der Challenges und die Partner-Karten nutzen `skill` (15). Ein Kern, eine Abbildung.
--   1 `apply_hackathon` und `set_hack_team_looking` prüfen gegen `skill` statt `hack_skill` (sonst aus dem Snapshot, Fehlerschlüssel
--     `invalid_skill` bleibt, Obergrenze 8 bleibt).
--   2 Bestand abbilden (`hack_application.skills`, `hack_team.looking_skills`; heute 1 Team, 2 Bewerbungen ohne Skills):
--     frontend, backend → programming · data → data_analysis, ai_ml · design → design · business → strategy, communication ·
--     hardware entfällt ohne Abbildung (nie benutzt). Schlüssel, die schon `skill`-Schlüssel sind, bleiben; Doppelte fallen weg.
--   3 Die Gruppe `hack_skill` wird inaktiv (`vocab_term.active = false`, nichts gelöscht: Altformate und Auswertungen finden die Bezeichnungen weiter).
-- `function_area` am Teilnehmerprofil folgt in einer eigenen Migration (anderer Baustein).

create or replace function apply_hackathon(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid; v_id uuid; v_skill text;
        v_github text; v_website text; v_behance text; v_tracks text[]; v_track text; v_prefs uuid[];
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(nullif(p_data->>'edition_id', '')::uuid);
  if v_ed is null then raise exception 'edition_not_found' using errcode = 'P0002'; end if;

  foreach v_skill in array coalesce(
    (select array_agg(value::text) from jsonb_array_elements_text(p_data->'skills') as t(value)), '{}') loop
    if not is_vocab_key('skill', v_skill) then
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

  -- Wunsch-Challenges (HACK-017): bis zu drei, Reihenfolge = Rang, ohne Doppelte; jede muss eine
  -- freigegebene Challenge derselben Edition sein. Freiwillig.
  begin
    v_prefs := coalesce((select array_agg(x.v order by x.o)
                           from (select distinct on (btrim(value)) btrim(value)::uuid as v, ord as o
                                   from jsonb_array_elements_text(
                                          case when jsonb_typeof(p_data->'challenge_prefs') = 'array'
                                               then p_data->'challenge_prefs' else '[]'::jsonb end)
                                        with ordinality as t(value, ord)
                                  where btrim(value) <> ''
                                  order by btrim(value), ord) x), '{}');
  exception when invalid_text_representation then
    raise exception 'invalid_challenge' using errcode = '22023', detail = 'challenge_prefs';
  end;
  if cardinality(v_prefs) > 3 then
    raise exception 'invalid_challenge' using errcode = '22023', detail = 'max 3';
  end if;
  if exists (select 1 from unnest(v_prefs) as p(id)
              where not exists (select 1 from hack_challenge c
                                 where c.id = p.id and c.edition_id = v_ed and c.status = 'published')) then
    raise exception 'invalid_challenge' using errcode = '22023', detail = 'challenge_prefs';
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

  insert into hack_application (person_id, edition_id, skills, motivation, team_pref, github_url, website_url, behance_url, track_prefs, challenge_prefs)
  values (v_me, v_ed,
          coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_data->'skills') as t(value)), '{}'),
          nullif(btrim(p_data->>'motivation'), ''), nullif(btrim(p_data->>'team_pref'), ''),
          v_github, v_website, v_behance, v_tracks, v_prefs)
  on conflict (person_id, edition_id) do update set
    skills = excluded.skills, motivation = excluded.motivation, team_pref = excluded.team_pref,
    github_url = excluded.github_url, website_url = excluded.website_url, behance_url = excluded.behance_url,
    track_prefs = excluded.track_prefs, challenge_prefs = excluded.challenge_prefs,
    status = case when hack_application.status = 'withdrawn' then 'applied' else hack_application.status end
  returning id into v_id;

  perform log_audit('hack.applied', 'hack_application', v_id::text, null, null);
  return v_id;
end $$;

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
    if not is_vocab_key('skill', v_k) then raise exception 'invalid_skill' using errcode = '22023', detail = v_k; end if;
  end loop;
  if cardinality(v_skills) > 8 then raise exception 'invalid_skill' using errcode = '22023', detail = 'max 8'; end if;
  if length(v_note) > 200 then raise exception 'too_long' using errcode = '22023', detail = '200'; end if;
  update hack_team set looking = coalesce(p_looking, false), looking_skills = v_skills, looking_note = v_note, updated_at = now()
   where id = v_team;
  perform log_audit('hack.team_looking', 'hack_team', v_team::text, null,
                    jsonb_build_object('looking', coalesce(p_looking, false), 'skills', v_skills));
end $$;

-- 2 Bestand: einmalig, nur Zeilen mit einem alten Schlüssel.
create temp table hack_skill_map (alt text primary key, neu text[] not null) on commit drop;
insert into hack_skill_map values
  ('frontend', array['programming']), ('backend', array['programming']),
  ('data', array['data_analysis', 'ai_ml']), ('design', array['design']),
  ('business', array['strategy', 'communication']), ('hardware', array[]::text[]);

update hack_application a
   set skills = coalesce((select array_agg(distinct x order by x)
                            from unnest(a.skills) s
                            cross join lateral unnest(coalesce((select m.neu from hack_skill_map m where m.alt = s), array[s])) x), '{}')
 where exists (select 1 from unnest(a.skills) s where s in (select alt from hack_skill_map) and s not in (select key from vocab_term where vocabulary = 'skill'));

update hack_team t
   set looking_skills = coalesce((select array_agg(distinct x order by x)
                                    from unnest(t.looking_skills) s
                                    cross join lateral unnest(coalesce((select m.neu from hack_skill_map m where m.alt = s), array[s])) x), '{}')
 where exists (select 1 from unnest(t.looking_skills) s where s in (select alt from hack_skill_map) and s not in (select key from vocab_term where vocabulary = 'skill'));

-- 3 Alte Gruppe auslaufen lassen.
update vocab_term set active = false where vocabulary = 'hack_skill' and active;

select harden_definer_functions();
