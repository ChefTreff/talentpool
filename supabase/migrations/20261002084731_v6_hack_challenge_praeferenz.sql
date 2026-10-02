-- 0251 · Wunsch-Challenges in der Hackathon-Bewerbung (bis zu drei, nur freigegebene der Edition), Auswahl nach Präferenz (HACK-017)
-- Angewendet von der Architektur-Session am 02.10.2026 als 20261002084731.
-- Auswahl im Admin nach Präferenz.
--
-- Anlass: Konrad im Call 24.09. (HACK-014-Abgleich); Fassung der Architektur-Session (01.10.):
-- bis zu drei Wunsch-Challenges **in der Bewerbung** (Reihenfolge = Rang), Auswahl im Admin
-- nach Präferenz, Prüfung wie bei `track_prefs`. (Die ältere Backlog-Fassung „Team reiht“ ist
-- damit überholt.)
--
-- Diese Migration:
--   1 `hack_application.challenge_prefs uuid[]` (≤ 3, Prüfsatz). Ein Fremdschlüssel auf
--     Array-Elemente geht nicht; geprüft wird in `apply_hackathon`: jede ID eine **freigegebene**
--     Challenge **derselben Edition** (22023 `invalid_challenge`, detail `challenge_prefs`),
--     keine Doppelten, höchstens drei. Wird eine Challenge später gelöscht, bleibt die ID stehen
--     und zeigt im Admin „—“ (der Admin liest die Titel aus `hack_challenges`).
--   2 `apply_hackathon` (Basis Snapshot 0235) liest `challenge_prefs`.
--   3 `hack_applications_admin` (Basis Snapshot) liefert `challenge_prefs` (Rückgabetyp ⇒
--     drop + create).
-- `my_hack` bleibt unberührt (läuft parallel in #296).
-- Fehlerschlüssel neu: `invalid_challenge` (lib/rpc-error.ts + Wörterbücher).
-- Test: supabase/tests/v6_hack_challenge_praeferenz.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Spalte

alter table hack_application add column if not exists challenge_prefs uuid[] not null default '{}';
alter table hack_application drop constraint if exists hack_application_challenge_prefs_chk;
alter table hack_application add constraint hack_application_challenge_prefs_chk
  check (cardinality(challenge_prefs) <= 3);
comment on column hack_application.challenge_prefs is
  'Wunsch-Challenges (HACK-017), Reihenfolge = Rang, höchstens 3; geprüft in apply_hackathon (freigegeben, gleiche Edition).';

-- ---------------------------------------------------------------- 2 · Bewerbung

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

-- ---------------------------------------------------------------- 3 · Admin

drop function if exists hack_applications_admin(uuid);
create or replace function hack_applications_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(application_id uuid, person_id uuid, first_name text, last_name text, status text, skills text[], motivation text, team_pref text, github_url text, website_url text, behance_url text, team_name text, applied_at timestamp with time zone, decided_at timestamp with time zone, track_prefs text[], occupation_status text, study_field text, study_program_label text, university text, graduation_year smallint, function_area text, profile_skills text[],
               challenge_prefs uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid := hack_edition(p_edition_id);
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.id, p.id, p.first_name, p.last_name, a.status, a.skills, a.motivation, a.team_pref,
           a.github_url, a.website_url, a.behance_url, t.name, a.applied_at, a.decided_at,
           a.track_prefs, p.occupation_status, p.study_field, p.study_program_label,
           p.university, p.graduation_year, p.function_area,
           coalesce((select array_agg(i.term_key order by i.term_key) from person_interest i
                      where i.person_id = p.id and i.vocabulary = 'skill'), '{}'),
           a.challenge_prefs
      from hack_application a
      join person p on p.id = a.person_id
      -- Mitgliedschaft nur dieser Edition (vorher ohne Edition: Doppelzeilen).
      left join hack_team_member m on m.person_id = a.person_id and m.edition_id = a.edition_id
      left join hack_team t on t.id = m.team_id
     where a.edition_id = v_ed and p.deleted_at is null
     order by case a.status when 'applied' then 0 when 'accepted' then 1 else 2 end, a.applied_at;
end $$;

select harden_definer_functions();
