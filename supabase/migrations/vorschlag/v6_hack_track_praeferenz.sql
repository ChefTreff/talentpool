-- 0000 · Track-Präferenz in der Hackathon-Bewerbung, Auswahl je Track mit Profilmerkmalen (HACK-010).
--
-- Anlass: Emilio (Call 24.09., HACK-006): Teilnehmende passen nicht immer zum Challenge-Typ
-- (Beispiel WHU eher Konzept als Technik). Backlog-Empfehlung: Track-Präferenz in der
-- Bewerbung, Auswahl je Track im Admin, Profilmerkmale (Studienfeld, Skills aus TAL-013) in
-- der Auswahl einblenden. Setzt v6_hack_tracks (HACK-008, Vokabular hack_track) voraus.
--
-- Diese Migration:
--   1 `hack_application.track_prefs text[]` (vocab hack_track, Mehrfachauswahl, höchstens 3,
--     keine Doppelten) + `vocab_binding` (is_array).
--   2 `apply_hackathon`: liest `track_prefs`; jeder Wert geprüft (22023 `invalid_vocab_value`,
--     detail `track_prefs`); mindestens einer, sobald es aktive Tracks gibt (22023
--     `track_pref_missing`). Basis: Snapshot (Stand 0228, HACK-007).
--   3 `my_hack`: `application.track_prefs`, `challenge.track`.
--   4 `hack_applications_admin`: zusätzlich `track_prefs` und Profilmerkmale für die Auswahl —
--     Tätigkeit, Studienfeld, Studiengang (Freitext), Hochschule, Abschlussjahr,
--     Funktionsbereich, Profil-Skills (person_interest, Vokabular skill). Weiterhin **ohne**
--     E-Mail und Telefon; die Liste sieht nur der Abschnitt hackathon (Team, kein Partner).
--     Nebenfund mit Fix: die Team-Spalte verband `hack_team_member` ohne Edition — eine
--     Person mit Team in einer früheren Edition erschien doppelt. Rückgabetyp ändert sich ⇒
--     drop + create.
-- `anonymize_person` braucht nichts: Track-Wünsche sind keine personenbeziehbaren Freitexte.
-- Basis: supabase/snapshot/functions/{apply_hackathon,my_hack,hack_applications_admin}.sql
-- Fehlerschlüssel neu: `track_pref_missing` (lib/rpc-error.ts + Wörterbücher im selben PR).
-- Test: supabase/tests/v6_hack_track_praeferenz.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Spalte

alter table hack_application add column if not exists track_prefs text[] not null default '{}';
alter table hack_application drop constraint if exists hack_application_track_prefs_chk;
alter table hack_application add constraint hack_application_track_prefs_chk
  check (cardinality(track_prefs) <= 3);
comment on column hack_application.track_prefs is
  'Gewünschte Tracks (vocab hack_track, HACK-010), 1–3, geprüft in apply_hackathon.';

insert into vocab_binding (vocabulary, table_name, column_name, is_array, note)
values ('hack_track', 'hack_application', 'track_prefs', true, 'Track-Wunsch in der Bewerbung (HACK-010)')
on conflict (vocabulary, table_name, column_name) do nothing;

-- ---------------------------------------------------------------- 2 · Bewerbung

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

-- ---------------------------------------------------------------- 3 · Eigene Sicht

create or replace function my_hack(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid; v_app hack_application; v_team hack_team;
        v_sub hack_submission; v_ch hack_challenge;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(p_edition_id);
  select * into v_app from hack_application where person_id = v_me and edition_id = v_ed;
  select t.* into v_team from hack_team t join hack_team_member m on m.team_id = t.id
   where m.person_id = v_me and t.edition_id = v_ed;
  if v_team.id is not null then
    select * into v_sub from hack_submission where team_id = v_team.id;
    select * into v_ch from hack_challenge where id = v_team.challenge_id;
  end if;

  return jsonb_build_object(
    'edition_id', v_ed,
    'application', case when v_app.id is null then null else jsonb_build_object(
      'id', v_app.id, 'status', v_app.status, 'skills', to_jsonb(v_app.skills),
      'motivation', v_app.motivation, 'team_pref', v_app.team_pref, 'applied_at', v_app.applied_at,
      'github_url', v_app.github_url, 'website_url', v_app.website_url, 'behance_url', v_app.behance_url,
      'track_prefs', to_jsonb(v_app.track_prefs)) end,
    'team', case when v_team.id is null then null else jsonb_build_object(
      'id', v_team.id, 'name', v_team.name, 'status', v_team.status,
      -- Den Beitrittscode sieht nur, wer schon drin ist.
      'join_code', v_team.join_code, 'discord_url', v_team.discord_url,
      'members', (select coalesce(jsonb_agg(jsonb_build_object(
                    'person_id', p.id, 'name', nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
                    'is_captain', m.is_captain) order by m.joined_at), '[]'::jsonb)
                  from hack_team_member m join person p on p.id = m.person_id where m.team_id = v_team.id)) end,
    'challenge', case when v_ch.id is null then null else jsonb_build_object(
      'id', v_ch.id, 'title', hack_text(v_ch.title_de, v_ch.title_en, p_language),
      'description', hack_text(v_ch.description_de, v_ch.description_en, p_language),
      'prizes', v_ch.prizes, 'resources', v_ch.resources, 'criteria', v_ch.criteria,
      'track', v_ch.track) end,
    'submission', case when v_sub.id is null then null else jsonb_build_object(
      'url', v_sub.url, 'repo_url', v_sub.repo_url, 'notes', v_sub.notes,
      'submitted_at', v_sub.submitted_at) end);
end $$;

-- ---------------------------------------------------------------- 4 · Auswahl im Admin

drop function if exists hack_applications_admin(uuid);
create or replace function hack_applications_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(application_id uuid, person_id uuid, first_name text, last_name text, status text, skills text[],
               motivation text, team_pref text, github_url text, website_url text, behance_url text, team_name text,
               applied_at timestamp with time zone, decided_at timestamp with time zone,
               track_prefs text[], occupation_status text, study_field text, study_program_label text,
               university text, graduation_year smallint, function_area text, profile_skills text[])
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
                      where i.person_id = p.id and i.vocabulary = 'skill'), '{}')
      from hack_application a
      join person p on p.id = a.person_id
      -- Mitgliedschaft nur dieser Edition (vorher ohne Edition: Doppelzeilen).
      left join hack_team_member m on m.person_id = a.person_id and m.edition_id = a.edition_id
      left join hack_team t on t.id = m.team_id
     where a.edition_id = v_ed and p.deleted_at is null
     order by case a.status when 'applied' then 0 when 'accepted' then 1 else 2 end, a.applied_at;
end $$;

select harden_definer_functions();
