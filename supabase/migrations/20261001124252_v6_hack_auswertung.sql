-- 0237 · Auswertungsart je Challenge (Jury oder Metrik), Metrik-Werte mit Bestätigung, Leaderboard (HACK-009)
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001124252.
--
-- Anlass: Emilio (Call 24.09., HACK-006): lange Abschluss-Pitches aller Teams, Gewinner nach
-- Präsentation. Backlog-Empfehlung: Feld `judging_mode` je Challenge — *Jury* (Pitch, heutige
-- Kriterien) oder *Metrik* (z. B. Prediction Accuracy, Leaderboard, klarer Gewinner); den
-- Metrik-Wert tragen zunächst Partner oder Team ein, das Hack-Team bestätigt ihn im Admin;
-- automatische Auswertung erst später.
--
-- Diese Migration:
--   1 `hack_challenge.judging_mode` ('jury'|'metric', Standard jury), `metric_label`,
--     `metric_higher_better` (Standard true). Prüfsatz: Metrik braucht eine Bezeichnung.
--   2 Formular `hackathon_challenge`: „Judging“ (Pflicht, Jury/Metric), „Metric“ (Text),
--     „Ranking“ (höher/niedriger besser) hinter „Track“. Optionen als englischer Text wie
--     bei den Tracks (Formular-Engine).
--   3 `publish_hack_challenge` übernimmt die drei Felder (Metrik ohne Bezeichnung ⇒ „Score“).
--   4 `set_hack_challenge_judging(p_challenge_id, p_mode, p_metric_label, p_higher_better)`:
--     Hack-Team (`is_hack_team()`), Audit `hack.challenge_judging`.
--   5 Tabelle `hack_metric_result` (ein Wert je Team; RLS an, keine Grants — nur über
--     Funktionen): `set_hack_metric(p_team_id, p_value, p_note)` dürfen **Mitglieder des
--     Teams** und die **Jury der Challenge** (`can_judge_hack_team`, schließt das Hack-Team
--     ein); nur bei Metrik-Challenges (22023 `not_metric_challenge`). Ein geänderter Wert
--     verliert die Bestätigung. `confirm_hack_metric(p_team_id, p_confirm)`: nur Hack-Team.
--     Audit `hack.metric_set` / `hack.metric_confirmed`.
--   6 `hack_leaderboard(p_challenge_id)`: angemeldete Personen sehen die **bestätigten**
--     Werte mit Rang (rank() je Richtung); das Hack-Team und die Jury der Challenge sehen
--     zusätzlich unbestätigte, das eigene Team seinen eigenen Wert. Nur Teamname und Wert,
--     keine Personen.
--   7 `hack_challenges` und `hack_judging` liefern die Auswertungsart (Rückgabetyp ⇒ drop +
--     create); `hack_judging` dazu Wert und Bestätigung je Team.
-- `my_hack` bleibt unberührt (HACK-010, #279, ändert es parallel): die App liest die
-- Auswertungsart der eigenen Challenge aus `hack_challenges`.
-- Basis: supabase/snapshot/functions/{publish_hack_challenge,hack_challenges,hack_judging}.sql
-- Fehlerschlüssel neu: `not_metric_challenge`, `metric_label_missing`, `invalid_metric`
-- (lib/rpc-error.ts + Wörterbücher im selben PR).
-- Test: supabase/tests/v6_hack_auswertung.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Spalten

alter table hack_challenge
  add column if not exists judging_mode text not null default 'jury',
  add column if not exists metric_label text,
  add column if not exists metric_higher_better boolean not null default true;
alter table hack_challenge drop constraint if exists hack_challenge_judging_mode_chk;
alter table hack_challenge add constraint hack_challenge_judging_mode_chk
  check (judging_mode in ('jury', 'metric') and (judging_mode = 'jury' or nullif(btrim(metric_label), '') is not null));
comment on column hack_challenge.judging_mode is 'Auswertungsart (HACK-009): jury = Pitch mit Kriterien, metric = Leaderboard nach metric_label.';
comment on column hack_challenge.metric_label is 'Bezeichnung der Metrik, z. B. „Prediction accuracy“ (nur bei judging_mode = metric).';
comment on column hack_challenge.metric_higher_better is 'Rangfolge: true = höherer Wert gewinnt.';

-- ---------------------------------------------------------------- 2 · Formularfelder

update deliverable_template tp
   set answers_schema = (
         select jsonb_agg(f order by ord)
           from (
             select e.f, e.ord::numeric as ord
               from jsonb_array_elements(tp.answers_schema) with ordinality as e(f, ord)
             union all
             select n.f, coalesce((select e2.ord from jsonb_array_elements(tp.answers_schema) with ordinality as e2(f, ord)
                                    where e2.f->>'key' = 'track'), 0) + n.pos
               from (values
                 (jsonb_build_object('key', 'judging_mode', 'type', 'select', 'required', true,
                    'label_de', 'Auswertung', 'label_en', 'Judging',
                    'options', '["Jury (pitch)","Metric (leaderboard)"]'::jsonb), 0.3),
                 (jsonb_build_object('key', 'metric_label', 'type', 'text', 'required', false,
                    'label_de', 'Metrik (nur bei Metric, z. B. Prediction accuracy)',
                    'label_en', 'Metric (only for Metric, e.g. prediction accuracy)'), 0.5),
                 (jsonb_build_object('key', 'metric_direction', 'type', 'select', 'required', false,
                    'label_de', 'Rangfolge (nur bei Metric)', 'label_en', 'Ranking (only for Metric)',
                    'options', '["Higher is better","Lower is better"]'::jsonb), 0.7)
               ) as n(f, pos)
           ) x(f, ord))
 where tp.key = 'hackathon_challenge'
   and jsonb_typeof(tp.answers_schema) = 'array'
   and not exists (select 1 from jsonb_array_elements(tp.answers_schema) e where e->>'key' = 'judging_mode');

-- ---------------------------------------------------------------- 3 · Freigabe

create or replace function publish_hack_challenge(p_deliverable_id uuid, p_track text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_d deliverable; v_oe org_edition; v_a jsonb; v_id uuid; v_crit jsonb := '[]'::jsonb; i integer;
        v_track text; v_mode text; v_metric text; v_higher boolean;
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

  -- Auswertung (HACK-009): aus dem Formular, ohne Angabe Jury. Metrik ohne
  -- Bezeichnung heißt „Score“ — die Formular-Engine kennt keine bedingten
  -- Pflichtfelder; ändern lässt es sich mit set_hack_challenge_judging.
  v_mode := case when lower(btrim(coalesce(v_a->>'judging_mode', ''))) like 'metric%' then 'metric' else 'jury' end;
  v_metric := case when v_mode = 'metric'
                   then coalesce(nullif(btrim(coalesce(v_a->>'metric_label', '')), ''), 'Score') end;
  v_higher := lower(btrim(coalesce(v_a->>'metric_direction', ''))) not like 'lower%';

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
                              description_en, description_de, prizes, resources, mentors, criteria, status, track,
                              judging_mode, metric_label, metric_higher_better)
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
          v_crit, 'published', v_track, v_mode, v_metric, v_higher)
  -- Der eindeutige Index ist partiell (0085: where deliverable_id is not null); ohne
  -- dasselbe Prädikat findet Postgres ihn nicht (42P10) — die Freigabe scheiterte live immer.
  on conflict (deliverable_id) where deliverable_id is not null do update set
    title_en = excluded.title_en, title_de = excluded.title_de,
    description_en = excluded.description_en, description_de = excluded.description_de,
    prizes = excluded.prizes, resources = excluded.resources,
    mentors = excluded.mentors, criteria = excluded.criteria,
    status = 'published', track = excluded.track,
    judging_mode = excluded.judging_mode, metric_label = excluded.metric_label,
    metric_higher_better = excluded.metric_higher_better, updated_at = now()
  returning id into v_id;

  perform log_audit('hack.challenge_published', 'hack_challenge', v_id::text, null,
                    jsonb_build_object('track', v_track, 'judging_mode', v_mode));
  return v_id;
end $$;

-- ---------------------------------------------------------------- 4 · Auswertungsart ändern

create or replace function set_hack_challenge_judging(p_challenge_id uuid, p_mode text,
                                                      p_metric_label text default null,
                                                      p_higher_better boolean default true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_old hack_challenge; v_label text := nullif(btrim(coalesce(p_metric_label, '')), '');
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_mode is null or p_mode not in ('jury', 'metric') then
    raise exception 'invalid_status' using errcode = '22023', detail = 'judging_mode';
  end if;
  if p_mode = 'metric' and v_label is null then
    raise exception 'metric_label_missing' using errcode = '22023';
  end if;
  if length(v_label) > 80 then raise exception 'metric_label_missing' using errcode = '22023'; end if;
  select * into v_old from hack_challenge where id = p_challenge_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update hack_challenge
     set judging_mode = p_mode,
         metric_label = case when p_mode = 'metric' then v_label end,
         metric_higher_better = coalesce(p_higher_better, true),
         updated_at = now()
   where id = p_challenge_id;
  perform log_audit('hack.challenge_judging', 'hack_challenge', p_challenge_id::text,
    jsonb_build_object('mode', v_old.judging_mode, 'metric', v_old.metric_label, 'higher', v_old.metric_higher_better),
    jsonb_build_object('mode', p_mode, 'metric', case when p_mode = 'metric' then v_label end,
                       'higher', coalesce(p_higher_better, true)));
end $$;

-- ---------------------------------------------------------------- 5 · Metrik-Werte

create table if not exists hack_metric_result (
  team_id      uuid primary key references hack_team(id) on delete cascade,
  value        numeric not null,
  note         text check (note is null or length(note) <= 500),
  entered_by   uuid references person(id) on delete set null,
  entered_at   timestamptz not null default now(),
  confirmed_by uuid references person(id) on delete set null,
  confirmed_at timestamptz
);
comment on table hack_metric_result is
  'Metrik-Wert je Team (HACK-009): eingetragen von Team oder Jury der Challenge, bestätigt vom Hack-Team. Zugriff nur über set_hack_metric, confirm_hack_metric, hack_leaderboard, hack_judging.';
alter table hack_metric_result enable row level security;
revoke all on hack_metric_result from anon, authenticated;

create or replace function set_hack_metric(p_team_id uuid, p_value numeric, p_note text default null)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_ed uuid; v_mode text; v_old numeric;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select t.edition_id, c.judging_mode into v_ed, v_mode
    from hack_team t left join hack_challenge c on c.id = t.challenge_id where t.id = p_team_id;
  if not found then raise exception 'team_not_found' using errcode = 'P0002'; end if;
  -- Eigenes Team oder Jury dieser Challenge (can_judge_hack_team schließt das Hack-Team ein).
  if p_team_id is distinct from my_hack_team_id(v_ed) and not can_judge_hack_team(p_team_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_mode is distinct from 'metric' then raise exception 'not_metric_challenge' using errcode = '22023'; end if;
  if p_value is null or p_value = 'NaN'::numeric or abs(p_value) > 1e12 then
    raise exception 'invalid_metric' using errcode = '22023';
  end if;
  if length(p_note) > 500 then raise exception 'invalid_metric' using errcode = '22023', detail = 'note'; end if;

  select value into v_old from hack_metric_result where team_id = p_team_id;
  insert into hack_metric_result (team_id, value, note, entered_by, entered_at)
  values (p_team_id, p_value, nullif(btrim(p_note), ''), v_me, now())
  on conflict (team_id) do update set
    value = excluded.value, note = excluded.note, entered_by = v_me, entered_at = now(),
    -- Ein neuer Wert muss neu bestätigt werden.
    confirmed_by = case when hack_metric_result.value = excluded.value then hack_metric_result.confirmed_by end,
    confirmed_at = case when hack_metric_result.value = excluded.value then hack_metric_result.confirmed_at end;
  perform log_audit('hack.metric_set', 'hack_team', p_team_id::text,
                    jsonb_build_object('value', v_old), jsonb_build_object('value', p_value));
end $$;

create or replace function confirm_hack_metric(p_team_id uuid, p_confirm boolean default true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  update hack_metric_result
     set confirmed_by = case when p_confirm then current_person_id() end,
         confirmed_at = case when p_confirm then now() end
   where team_id = p_team_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform log_audit('hack.metric_confirmed', 'hack_team', p_team_id::text, null,
                    jsonb_build_object('confirmed', coalesce(p_confirm, false)));
end $$;

-- ---------------------------------------------------------------- 6 · Leaderboard

create or replace function hack_leaderboard(p_challenge_id uuid)
 RETURNS TABLE(rank integer, team_id uuid, team_name text, value numeric, confirmed boolean, is_mine boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_c hack_challenge; v_mine uuid; v_all boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_c from hack_challenge where id = p_challenge_id and status = 'published';
  if not found or v_c.judging_mode <> 'metric' then return; end if;
  v_mine := my_hack_team_id(v_c.edition_id);
  -- Unbestätigte Werte: Hack-Team und Jury dieser Challenge.
  v_all := is_hack_team() or (v_c.org_id is not null and has_role('hackathon_partner') and is_member_of_org(v_c.org_id));
  return query
    select case when r.confirmed_at is not null
                then (rank() over (partition by r.confirmed_at is not null
                                   order by case when v_c.metric_higher_better then -r.value else r.value end))::integer
           end,
           t.id, t.name, r.value, r.confirmed_at is not null, t.id = v_mine
      from hack_metric_result r
      join hack_team t on t.id = r.team_id
     where t.challenge_id = p_challenge_id and t.status <> 'withdrawn'
       and (r.confirmed_at is not null or v_all or t.id = v_mine)
     order by (r.confirmed_at is null), case when v_c.metric_higher_better then -r.value else r.value end, t.name;
end $$;

-- ---------------------------------------------------------------- 7 · Listen

drop function if exists hack_challenges(uuid, text);
create or replace function hack_challenges(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS TABLE(id uuid, title text, description text, prizes text, resources text, mentors jsonb, criteria jsonb, org_name text, teams integer, track text,
               judging_mode text, metric_label text, metric_higher_better boolean)
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
           c.track, c.judging_mode, c.metric_label, c.metric_higher_better
      from hack_challenge c
      left join organization o on o.id = c.org_id
     where c.edition_id = hack_edition(p_edition_id) and c.status = 'published'
     order by c.sort_order, hack_text(c.title_de, c.title_en, p_language);
end $$;

drop function if exists hack_judging(uuid, text);
create or replace function hack_judging(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS TABLE(team_id uuid, team_name text, challenge_title text, criteria jsonb, submission_url text, repo_url text, notes text, submitted_at timestamp with time zone, my_criteria jsonb, my_total numeric, my_note text,
               judging_mode text, metric_label text, metric_value numeric, metric_confirmed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_hack_judge() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select t.id, t.name, hack_text(c.title_de, c.title_en, p_language), coalesce(c.criteria, '[]'::jsonb),
           s.url, s.repo_url, s.notes, s.submitted_at,
           j.criteria, j.total, j.note,
           coalesce(c.judging_mode, 'jury'), c.metric_label, r.value, r.confirmed_at is not null
      from hack_team t
      left join hack_challenge c on c.id = t.challenge_id
      left join hack_submission s on s.team_id = t.id
      left join hack_judging_score j on j.team_id = t.id and j.judge_id = current_person_id()
      left join hack_metric_result r on r.team_id = t.id
     where t.edition_id = hack_edition(p_edition_id) and t.status <> 'withdrawn'
       -- Partner-Jury: nur die Teams der eigenen Challenge.
       and can_judge_hack_team(t.id)
     order by t.name;
end $$;

select harden_definer_functions();
