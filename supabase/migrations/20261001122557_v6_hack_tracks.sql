-- 0233 · Hackathon-Tracks je Challenge (HACK-008): Vokabular hack_track, Pflicht bei der Freigabe, Freigabe-Fehler 42P10 behoben
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001122557.
-- Pflichtfeld im Challenge-Formular, Track bei der Freigabe und im Admin.
--
-- Anlass: Emilio (Call mit Konrad 24.09., HACK-006): Alle Challenges enden in einem Pitch, viele
-- Informatiker wollen keine Slides bauen. Lösung laut Backlog-Empfehlung: drei Tracks
-- *Physical AI / Robotik-Simulation*, *Data Science*, *Konzept* — Pflichtfeld beim Anlegen der
-- Challenge, Filter in der Teilnehmer-App.
--
-- Diese Migration:
--   1 Vokabular `hack_track` (3 Begriffe) + `vocab_binding` (Löschsperre in der Vokabularpflege).
--   2 Spalte `hack_challenge.track` (vocab hack_track).
--   3 Formular `hackathon_challenge`: Pflicht-Auswahl „Track“ hinter der Beschreibung. Die
--     Formular-Engine kennt Optionen nur als Text (Wert = Anzeige), darum stehen dort die
--     englischen Bezeichnungen (das Formular ist englisch geführt); `hack_track_key` löst sie
--     auf den Schlüssel auf (Schlüssel, Bezeichnung DE oder EN, ohne Groß/klein).
--   4 `publish_hack_challenge(p_deliverable_id, p_track default null)`: Track = Angabe des
--     Hack-Teams › Formularantwort › bisheriger Wert. Ohne Track keine Freigabe
--     (22023 `track_missing`), unbekannter Wert 22023 `invalid_vocab_value` (detail `track`).
--     Damit lassen sich auch Formulare freigeben, die vor dem Feld eingereicht wurden.
--   5 `set_hack_challenge_track(p_challenge_id, p_track)`: Track einer freigegebenen Challenge
--     ändern (Abschnitt hackathon über `is_hack_team()`, Audit `hack.challenge_track`).
--   6 `hack_challenges` und `hack_open_challenges` liefern zusätzlich `track` (Schlüssel) — die
--     Teilnehmer-App filtert, der Admin wählt vor. Rückgabetyp ändert sich ⇒ drop + create.
-- Fund beim Bau: `publish_hack_challenge` scheiterte live bei JEDER Freigabe mit 42P10 — der
-- eindeutige Index auf deliverable_id ist partiell, `on conflict` nannte das Prädikat nicht.
-- Behoben in Abschnitt 4; Test Schritt 05/06 belegt es.
-- Ein Prüfsatz „freigegeben ⇒ Track gesetzt“ an der Tabelle entfällt bewusst: bereits
-- freigegebene Challenges ohne Track würden sonst jede spätere Änderung blockieren; die
-- Regel sitzt in `publish_hack_challenge`, der einzige Weg zu `published`.
-- Basis: supabase/snapshot/functions/{publish_hack_challenge,hack_challenges,hack_open_challenges}.sql
-- Fehlerschlüssel neu: `track_missing` (lib/rpc-error.ts + Wörterbücher im selben PR).
-- Test: supabase/tests/v6_hack_tracks.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Vokabular

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active)
select v.* from (values
  ('hack_track', 'physical_ai',  'Physical AI / Robotik-Simulation', 'Physical AI / robotics simulation', 1, true),
  ('hack_track', 'data_science', 'Data Science',                     'Data science',                      2, true),
  ('hack_track', 'concept',      'Konzept (Idee und Slides)',        'Concept (idea and slides)',         3, true)
) as v(vocabulary, key, label_de, label_en, sort_order, active)
where not exists (select 1 from vocab_term t where t.vocabulary = v.vocabulary and t.key = v.key);

insert into vocab_binding (vocabulary, table_name, column_name, is_array, note)
values ('hack_track', 'hack_challenge', 'track', false, 'Track je Challenge (HACK-008)')
on conflict (vocabulary, table_name, column_name) do nothing;

-- ---------------------------------------------------------------- 2 · Spalte

alter table hack_challenge add column if not exists track text;
comment on column hack_challenge.track is
  'vocab hack_track (HACK-008). Pflicht bei der Freigabe (publish_hack_challenge), änderbar über set_hack_challenge_track.';

-- Schlüssel aus Formularwert: Schlüssel selbst oder Bezeichnung (DE/EN), ohne Groß/klein.
create or replace function hack_track_key(p_value text)
returns text
language sql stable
set search_path = public, extensions
as $$
  select t.key from vocab_term t
   where t.vocabulary = 'hack_track' and t.active
     and lower(btrim(p_value)) in (lower(t.key), lower(t.label_en), lower(t.label_de))
   order by t.sort_order limit 1
$$;

-- ---------------------------------------------------------------- 3 · Formularfeld

update deliverable_template tp
   set answers_schema = (
         select jsonb_agg(f order by ord)
           from (
             select e.f, e.ord::numeric as ord
               from jsonb_array_elements(tp.answers_schema) with ordinality as e(f, ord)
             union all
             -- hinter description_en einsortieren
             select jsonb_build_object(
                      'key', 'track', 'type', 'select', 'required', true,
                      'label_de', 'Track', 'label_en', 'Track',
                      'options', (select jsonb_agg(t.label_en order by t.sort_order)
                                    from vocab_term t where t.vocabulary = 'hack_track' and t.active)),
                    coalesce((select e2.ord from jsonb_array_elements(tp.answers_schema) with ordinality as e2(f, ord)
                               where e2.f->>'key' = 'description_en'), 0) + 0.5
           ) x(f, ord))
 where tp.key = 'hackathon_challenge'
   and jsonb_typeof(tp.answers_schema) = 'array'
   and not exists (select 1 from jsonb_array_elements(tp.answers_schema) e where e->>'key' = 'track');

-- ---------------------------------------------------------------- 4 · Freigabe mit Track

drop function if exists publish_hack_challenge(uuid);
create or replace function publish_hack_challenge(p_deliverable_id uuid, p_track text default null)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_d deliverable; v_oe org_edition; v_a jsonb; v_id uuid; v_crit jsonb := '[]'::jsonb; i integer;
        v_track text;
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_d from deliverable where id = p_deliverable_id;
  if not found then raise exception 'deliverable_not_found' using errcode = 'P0002'; end if;
  select * into v_oe from org_edition where id = v_d.org_edition_id;
  v_a := coalesce(v_d.answers, '{}'::jsonb);

  -- Track (HACK-008): Angabe des Hack-Teams › Formularantwort › bisheriger Wert.
  if nullif(btrim(coalesce(p_track, '')), '') is not null then
    if not is_vocab_key('hack_track', btrim(p_track)) then
      raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'track';
    end if;
    v_track := btrim(p_track);
  else
    v_track := coalesce(hack_track_key(v_a->>'track'),
                        (select c.track from hack_challenge c where c.deliverable_id = p_deliverable_id));
  end if;
  if v_track is null then raise exception 'track_missing' using errcode = '22023'; end if;

  -- Vier Kriterien als feste Felder: die Formular-Engine kennt keine
  -- Wiederholgruppen. Leere Zeilen fallen weg.
  for i in 1..4 loop
    if nullif(btrim(coalesce(v_a->>('criterion_' || i || '_label'), '')), '') is not null then
      v_crit := v_crit || jsonb_build_array(jsonb_build_object(
        'key', 'c' || i,
        'label', v_a->>('criterion_' || i || '_label'),
        'weight', coalesce((v_a->>('criterion_' || i || '_weight'))::numeric, 25)));
    end if;
  end loop;

  insert into hack_challenge (edition_id, org_id, deliverable_id, title_en, title_de,
                              description_en, description_de, prizes, resources, mentors, criteria, status, track)
  values (v_oe.edition_id, v_oe.org_id, p_deliverable_id,
          coalesce(nullif(btrim(v_a->>'title_en'), ''), nullif(btrim(v_a->>'title'), ''), 'Challenge'),
          nullif(btrim(v_a->>'title_de'), ''),
          nullif(btrim(v_a->>'description_en'), ''), nullif(btrim(v_a->>'description_de'), ''),
          nullif(btrim(v_a->>'prizes'), ''), nullif(btrim(v_a->>'resources'), ''),
          -- Mentoren aus dem Formular: eine Zeile je Person („Name, Rolle").
          coalesce(v_a->'mentors',
                   case when nullif(btrim(coalesce(v_a->>'mentor_names', '')), '') is not null
                        then to_jsonb(array_remove(regexp_split_to_array(btrim(v_a->>'mentor_names'), '\s*\n\s*'), ''))
                        else '[]'::jsonb end),
          v_crit, 'published', v_track)
  -- Der eindeutige Index ist partiell (0085: where deliverable_id is not null); ohne
  -- dasselbe Prädikat findet Postgres ihn nicht (42P10) — die Freigabe scheiterte live immer.
  on conflict (deliverable_id) where deliverable_id is not null do update set
    title_en = excluded.title_en, title_de = excluded.title_de,
    description_en = excluded.description_en, description_de = excluded.description_de,
    prizes = excluded.prizes, resources = excluded.resources,
    mentors = excluded.mentors, criteria = excluded.criteria,
    status = 'published', track = excluded.track, updated_at = now()
  returning id into v_id;

  perform log_audit('hack.challenge_published', 'hack_challenge', v_id::text, null,
                    jsonb_build_object('track', v_track));
  return v_id;
end $$;

-- ---------------------------------------------------------------- 5 · Track ändern

create or replace function set_hack_challenge_track(p_challenge_id uuid, p_track text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_old text;
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_track, '')), '') is null or not is_vocab_key('hack_track', btrim(p_track)) then
    raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'track';
  end if;
  select track into v_old from hack_challenge where id = p_challenge_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update hack_challenge set track = btrim(p_track), updated_at = now() where id = p_challenge_id;
  perform log_audit('hack.challenge_track', 'hack_challenge', p_challenge_id::text,
                    jsonb_build_object('track', v_old), jsonb_build_object('track', btrim(p_track)));
end $$;

-- ---------------------------------------------------------------- 6 · Listen mit Track

drop function if exists hack_challenges(uuid, text);
create or replace function hack_challenges(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS TABLE(id uuid, title text, description text, prizes text, resources text, mentors jsonb, criteria jsonb, org_name text, teams integer, track text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select c.id, hack_text(c.title_de, c.title_en, p_language),
           hack_text(c.description_de, c.description_en, p_language),
           c.prizes, c.resources, c.mentors, c.criteria,
           coalesce(o.communication_name, o.legal_name),
           (select count(*)::integer from hack_team t where t.challenge_id = c.id and t.status <> 'withdrawn'),
           c.track
      from hack_challenge c
      left join organization o on o.id = c.org_id
     where c.edition_id = hack_edition(p_edition_id) and c.status = 'published'
     order by c.sort_order, hack_text(c.title_de, c.title_en, p_language);
end $$;

drop function if exists hack_open_challenges(uuid);
create or replace function hack_open_challenges(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(deliverable_id uuid, org_name text, title text, submitted_at timestamp with time zone, track text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid := hack_edition(p_edition_id);
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select d.id, coalesce(o.communication_name, o.legal_name),
           coalesce(nullif(d.answers->>'title_en', ''), nullif(d.answers->>'title_de', '')),
           d.submitted_at,
           hack_track_key(d.answers->>'track')
      from deliverable d
      join deliverable_template tp on tp.id = d.template_id and tp.key = 'hackathon_challenge'
      join org_edition oe on oe.id = d.org_edition_id and oe.edition_id = v_ed
      join organization o on o.id = oe.org_id
     where d.status = 'submitted'
     order by d.submitted_at nulls last;
end $$;

select harden_definer_functions();
