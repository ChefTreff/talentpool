-- 0259 · Feedback-Fenster: anonym oder mit Klarnamen, Tageslimit ohne Uhrzeit, Abschnitt feedback (TAL-011)
-- Angewendet von der Architektur-Session am 02.10.2026 als 20261002091904.
-- Summit-Fragen nach der Umfrage des Vorjahres, Admin-Abschnitt zum Sichten.
--
-- Anlass: Konzept docs/talent-konzepte-009-011.md, Konrads Antworten K-43 (02.10.): (6) „wirklich
-- anonym“, Vorlage die Typeform-Umfrage FLS26 (Fragen übernommen und angepasst, kein Einbetten);
-- (7) KI-Clustering später.
--
-- Übernommen aus der Umfrage FLS26: sechs Bewertungen 1–5 (gesamt, Programm & Speaker, Expo &
-- Partner, Masterclasses, App & Matchmaking, Side Events & Afterpartys), „Wiederkommen?“
-- (ja/unsicher/nein), Hauptgrund des Besuchs, „Programmpunkt in Erinnerung“, Lob/Kritik/Ideen.
-- Nicht übernommen: Profilfragen (Herkunft, Status, Level, Startup-Phase, Themen — stehen im
-- Profil) und die Verlosung mit E-Mail-Adresse (höbe die Anonymität auf).
--
-- **Anonym heißt wirklich anonym:** keine `person_id`, kein Zeitstempel — nur das Datum
-- (`created_on`), kein Audit-Eintrag je Einsendung (er nennte Person und Uhrzeit). Missbrauch
-- begrenzt ein Tageszähler je Konto in einer **eigenen** Tabelle ohne Bezug zum Text und ohne
-- Uhrzeit (höchstens 5 je Tag).
--
-- Diese Migration:
--   1 Vokabulare `feedback_format` (Summit, Community-Event, Masterclass, Company Tour, Bootcamp,
--     Academy, Hackathon, Portal, Sonstiges), `feedback_kind` (Idee, Lob, Kritik),
--     `feedback_reason` (Hauptgrund, aus FLS26).
--   2 Tabellen `feedback_entry` und `feedback_quota`: RLS an, **keine Grants**.
--   3 `submit_feedback(p_data jsonb, p_anonymous boolean)`: angemeldet, Tageslimit, Prüfung aller
--      Werte gegen Vokabular und Bereiche; Bewertungen nur beim Format Summit.
--   4 Admin-Abschnitt `feedback` (admin, area_lead_talent, talent_team, marketing_team):
--      `feedback_admin()` (bei Klarnamen Name und primäre E-Mail für die Antwort, sonst nichts),
--      `set_feedback(p_id, p_status, p_tags)` (Audit), `feedback_summit_summary()` (Mittelwerte).
-- Fehlerschlüssel neu: `feedback_limit` (lib/rpc-error.ts + Wörterbücher).
-- Test: supabase/tests/v6_feedback.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Vokabulare

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active)
select v.* from (values
  ('feedback_format', 'summit',           'Summit',              'Summit',             1, true),
  ('feedback_format', 'community_event',  'Community-Event',     'Community event',    2, true),
  ('feedback_format', 'masterclass',      'Masterclass',         'Masterclass',        3, true),
  ('feedback_format', 'company_tour',     'Company Tour',        'Company tour',       4, true),
  ('feedback_format', 'bootcamp',         'Bootcamp',            'Bootcamp',           5, true),
  ('feedback_format', 'academy',          'Academy',             'Academy',            6, true),
  ('feedback_format', 'hackathon',        'Hackathon',           'Hackathon',          7, true),
  ('feedback_format', 'portal',           'Dieses Portal',       'This portal',        8, true),
  ('feedback_format', 'other',            'Sonstiges',           'Other',              9, true),
  ('feedback_kind',   'idea',             'Idee',                'Idea',               1, true),
  ('feedback_kind',   'praise',           'Lob',                 'Praise',             2, true),
  ('feedback_kind',   'criticism',        'Kritik',              'Criticism',          3, true),
  ('feedback_reason', 'speakers',         'Spannende Speaker',   'Inspiring speakers', 1, true),
  ('feedback_reason', 'networking',       'Netzwerken',          'Networking',         2, true),
  ('feedback_reason', 'masterclasses',    'Die Masterclasses',   'The masterclasses',  3, true),
  ('feedback_reason', 'friends',          'Freunde oder Kollegen', 'Friends or colleagues', 4, true),
  ('feedback_reason', 'skills',           'Neue Skills lernen',  'Learning new skills', 5, true),
  ('feedback_reason', 'jobs',             'Neue Jobchancen',     'New job opportunities', 6, true),
  ('feedback_reason', 'other',            'Anderes',             'Other',              7, true)
) as v(vocabulary, key, label_de, label_en, sort_order, active)
where not exists (select 1 from vocab_term t where t.vocabulary = v.vocabulary and t.key = v.key);

-- ---------------------------------------------------------------- 2 · Tabellen

create table if not exists feedback_entry (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid references person(id) on delete set null,   -- null = anonym
  format         text not null,
  kind           text,
  ratings        jsonb not null default '{}'::jsonb,
  return_intent  text check (return_intent is null or return_intent in ('yes', 'unsure', 'no')),
  main_reason    text,
  memorable      text check (memorable is null or length(memorable) <= 1000),
  body           text check (body is null or length(body) <= 2000),
  created_on     date not null default current_date,                -- bewusst nur das Datum
  status         text not null default 'open' check (status in ('open', 'seen', 'done')),
  tags           text[] not null default '{}' check (cardinality(tags) <= 10),
  handled_by     uuid references person(id) on delete set null,
  constraint feedback_entry_inhalt_chk check (nullif(btrim(coalesce(body, '')), '') is not null
                                             or ratings <> '{}'::jsonb or memorable is not null)
);
comment on table feedback_entry is
  'Feedback (TAL-011). person_id null = anonym; dann gibt es weder Person noch Uhrzeit (nur created_on) noch einen Audit-Eintrag. Zugriff nur über Funktionen.';
alter table feedback_entry enable row level security;
revoke all on feedback_entry from anon, authenticated;

create table if not exists feedback_quota (
  person_id uuid not null references person(id) on delete cascade,
  day       date not null,
  n         integer not null default 0,
  primary key (person_id, day)
);
comment on table feedback_quota is 'Tageszähler für Feedback (TAL-011) — getrennt vom Text, ohne Uhrzeit, damit anonyme Einsendungen nicht zuzuordnen sind.';
alter table feedback_quota enable row level security;
revoke all on feedback_quota from anon, authenticated;

insert into admin_section_role (section, role) values
  ('feedback', 'admin'), ('feedback', 'area_lead_talent'), ('feedback', 'talent_team'), ('feedback', 'marketing_team')
on conflict do nothing;

-- ---------------------------------------------------------------- 3 · Einsenden

create or replace function submit_feedback(p_data jsonb, p_anonymous boolean default true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_n integer; v_format text := btrim(coalesce(p_data->>'format', ''));
        v_kind text := nullif(btrim(coalesce(p_data->>'kind', '')), '');
        v_reason text := nullif(btrim(coalesce(p_data->>'main_reason', '')), '');
        v_intent text := nullif(btrim(coalesce(p_data->>'return_intent', '')), '');
        v_body text := nullif(btrim(coalesce(p_data->>'body', '')), '');
        v_memo text := nullif(btrim(coalesce(p_data->>'memorable', '')), '');
        v_ratings jsonb := '{}'::jsonb; v_key text; v_val integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not is_vocab_key('feedback_format', v_format) then raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'format'; end if;
  if v_kind is not null and not is_vocab_key('feedback_kind', v_kind) then raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'kind'; end if;
  if v_reason is not null and not is_vocab_key('feedback_reason', v_reason) then raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'main_reason'; end if;
  if v_intent is not null and v_intent not in ('yes', 'unsure', 'no') then raise exception 'invalid_vocab_value' using errcode = '22023', detail = 'return_intent'; end if;
  if length(v_body) > 2000 or length(v_memo) > 1000 then raise exception 'too_long' using errcode = '22023'; end if;

  -- Bewertungen 1–5 nur beim Summit, nur die sechs Fragen aus FLS26.
  if jsonb_typeof(p_data->'ratings') = 'object' then
    for v_key in select jsonb_object_keys(p_data->'ratings') loop
      if v_key not in ('overall', 'programme', 'expo', 'masterclasses', 'app', 'side_events') then
        raise exception 'invalid_rating' using errcode = '22023', detail = v_key;
      end if;
      begin v_val := (p_data->'ratings'->>v_key)::integer; exception when others then v_val := null; end;
      if v_val is null then continue; end if;
      if v_val < 1 or v_val > 5 then raise exception 'invalid_rating' using errcode = '22023', detail = v_key; end if;
      v_ratings := v_ratings || jsonb_build_object(v_key, v_val);
    end loop;
  end if;
  if v_format <> 'summit' then v_ratings := '{}'::jsonb; v_intent := null; v_reason := null; v_memo := null; end if;
  if v_body is null and v_ratings = '{}'::jsonb and v_memo is null then
    raise exception 'missing_field' using errcode = '22023', detail = 'body';
  end if;

  -- Tageslimit: Zähler getrennt vom Text, ohne Uhrzeit.
  insert into feedback_quota (person_id, day, n) values (v_me, current_date, 1)
  on conflict (person_id, day) do update set n = feedback_quota.n + 1
  returning n into v_n;
  if v_n > 5 then raise exception 'feedback_limit' using errcode = 'P0001', detail = '5'; end if;

  insert into feedback_entry (person_id, format, kind, ratings, return_intent, main_reason, memorable, body)
  values (case when coalesce(p_anonymous, true) then null else v_me end,
          v_format, v_kind, v_ratings, v_intent, v_reason, v_memo, v_body);
  -- Bewusst kein Audit-Eintrag: er nennte Person und Uhrzeit und höbe die Anonymität auf.
end $$;

-- ---------------------------------------------------------------- 4 · Admin

create or replace function feedback_admin()
 RETURNS TABLE(id uuid, format text, kind text, ratings jsonb, return_intent text, main_reason text, memorable text,
               body text, created_on date, status text, tags text[], anonymous boolean,
               first_name text, last_name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not coalesce(has_admin_section('feedback'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select f.id, f.format, f.kind, f.ratings, f.return_intent, f.main_reason, f.memorable, f.body, f.created_on,
           f.status, f.tags, f.person_id is null, p.first_name, p.last_name, e.email::text
      from feedback_entry f
      left join person p on p.id = f.person_id
      left join person_email e on e.person_id = f.person_id and e.is_primary
     order by (f.status = 'open') desc, f.created_on desc, f.id;
end $$;

create or replace function set_feedback(p_id uuid, p_status text, p_tags text[] default null)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_tags text[] := coalesce((select array_agg(distinct left(btrim(x), 40)) from unnest(p_tags) x where btrim(x) <> ''), '{}');
begin
  if not coalesce(has_admin_section('feedback'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('open', 'seen', 'done') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if cardinality(v_tags) > 10 then raise exception 'too_long' using errcode = '22023', detail = 'tags'; end if;
  update feedback_entry set status = p_status, tags = v_tags, handled_by = current_person_id() where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform log_audit('feedback.updated', 'feedback_entry', p_id::text, null, jsonb_build_object('status', p_status, 'tags', v_tags));
end $$;

create or replace function feedback_summit_summary()
 RETURNS TABLE(question text, answers integer, average numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not coalesce(has_admin_section('feedback'), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select q.k, count(f.ratings->>q.k)::integer, round(avg((f.ratings->>q.k)::numeric), 2)
      from unnest(array['overall', 'programme', 'expo', 'masterclasses', 'app', 'side_events']) with ordinality as q(k, o)
      left join feedback_entry f on f.format = 'summit' and f.ratings ? q.k
     group by q.k, q.o
     order by q.o;
end $$;

select harden_definer_functions();
