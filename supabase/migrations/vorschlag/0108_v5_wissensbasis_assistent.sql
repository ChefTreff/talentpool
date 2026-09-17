-- =============================================================================
-- 0108 · Welle 5 · Assistent auf der Wissensbasis: Suche, Zähler, Protokoll
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- QS-015: Im Alt-Portal war der Chatbot auf beiden Hubs der erste Anlaufpunkt.
-- Konrad am 17.09.: „vorher machen, der ist wichtig." Damit rückt der Punkt von
-- P3 („nach dem Go-live") auf P1.
--
-- Die Antwort formuliert später ein Sprachmodell, **aber nur aus Abschnitten,
-- die diese Migration liefert.** Alles, was über die Sichtbarkeit entscheidet,
-- bleibt deshalb hier unten: Zielgruppe, Status, Gültigkeit, Edition. Das Modell
-- bekommt Text und Frage, sonst nichts — es kann nichts nachschlagen, was es
-- nicht bekommen hat.
--
-- **Warum Volltextsuche und kein pgvector** (Architektur-Session 17.09.): bei 26
-- bis 60 Artikeln trägt `tsvector` die Trefferqualität, und wir sparen einen
-- weiteren Anbieter samt AVV. pgvector bleibt der zweite Schritt, falls die
-- Treffer nicht genügen.
--
-- Vier Stücke:
--
-- 1. **`kb_chunk`** — der Artikel in Abschnitten. Ein Abschnitt ist ein
--    H2-Block; H3 bleibt in seinem Text, sonst zerfiele eine Antwort in
--    Bruchstücke. Sehr lange Abschnitte werden an Absatzgrenzen geteilt, und
--    **jedes Teilstück trägt die Überschrift erneut** — sonst rutscht ein
--    Mittelteil ohne Kontext ins Ranking.
--
--    Die Tabelle trägt **keine** Zielgruppe und keinen Status. Das ist Absicht:
--    Berechtigungsfelder zu kopieren heisst, sie irgendwann auseinanderlaufen zu
--    lassen. `kb_search` verbindet stattdessen mit `kb_article` und liest die
--    Wahrheit dort.
--
-- 2. **`kb_search`** — dieselben Sichtbarkeitsregeln wie `kb_articles` (0087,
--    Sprachrückfall 0088): nur `published`, Zielgruppe aus `my_kb_audiences()`,
--    nicht abgelaufen, Edition überlagert evergreen, Wunschsprache vor der
--    anderen. Das Kiosk-Gerätekonto ist ausdrücklich draussen.
--
-- 3. **`kb_rate_limit`** — 20 Fragen je Person und Stunde. Gezählt in der
--    Datenbank, nicht im Speicher der Instanz: sonst zählt jede Vercel-Region
--    für sich und das Limit ist keines. Die Tabelle kennt `auth.uid()`, das
--    Protokoll kennt niemanden — **die beiden werden nie verbunden**, und
--    deshalb stehen sie auch nicht in derselben Zeile.
--
-- 4. **`kb_question_log`** — was gefragt wurde, ohne wer. Zweck ist die
--    Wiki-Pflege: Fragen ohne Treffer sind die Lücken. Gespeichert werden
--    Zielgruppe, Sprache, Frage, gefundene Artikel, Treffer ja/nein, Zeitpunkt
--    und Dauer — **keine Antworttexte, keine `person_id`**. Der Fragetext kann
--    trotz Hinweis im Feld Persönliches enthalten, deshalb rollierend 90 Tage.
--
-- Fehlerschlüssel: 28000 ohne Login · 42501 fremde Zielgruppe oder Kiosk ·
-- 22023 `empty_query` · P0001 `rate_limited` · P0001 `no_slot` (Protokollzeile
-- ohne vorher genommenen Slot).
--
-- **Zwei Eigenheiten der Suche, in v1 bewusst so** (Vermerk der
-- Architektur-Session, 17.09.):
--
-- * **Die Editionsfassung ersetzt den evergreen nicht.** `kb_articles` nimmt je
--   Slug genau eine Fassung (`distinct on`); `kb_search` sucht über alle
--   Abschnitte und sortiert die Editionsfassung nur nach vorn. Zu einem Slug
--   können also beide Fassungen im Kontext landen. Für eine Antwort ist das
--   eher nützlich als schädlich — und die Oberfläche zeigt weiterhin die
--   Fassung, die `kb_articles` liefert.
-- * **DE und EN sind Zwillinge, keine Übersetzungen.** Beide Sprachfassungen
--   stehen als eigene Artikel in der Tabelle, und die Suche bevorzugt die
--   Portalsprache, schliesst die andere aber nicht aus. Wer auf Deutsch fragt
--   und nur einen englischen Abschnitt hat, bekommt ihn — mit dem Hinweis in
--   der Antwort, dass es ihn nur dort gibt.
--
-- Test: supabase/tests/v5_wissensbasis_assistent.sql
-- =============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------- Abschnitte

create table if not exists kb_chunk (
  id            uuid primary key default gen_random_uuid(),
  article_id    uuid not null references kb_article(id) on delete cascade,
  section_index integer not null,
  -- NULL = der Text vor der ersten Überschrift (Einleitung).
  heading       text,
  body          text not null,
  language      text not null,
  ts            tsvector not null,
  created_at    timestamptz not null default now(),
  unique (article_id, section_index)
);
create index if not exists kb_chunk_ts_idx on kb_chunk using gin (ts);
create index if not exists kb_chunk_article_idx on kb_chunk (article_id);
comment on table kb_chunk is
  'Artikel der Wissensbasis in H2-Abschnitten, für die Volltextsuche des Assistenten (0108). Entsteht ausschliesslich per Trigger aus kb_article; Zielgruppe und Status stehen bewusst NICHT hier, sondern werden beim Suchen aus kb_article gelesen.';

alter table kb_chunk enable row level security;
revoke all on kb_chunk from anon, authenticated;
-- Keine Policy: gelesen wird ausschliesslich über `kb_search`.

/** Die Textsuche-Konfiguration zur Sprache. Unbekanntes ist Deutsch. */
create or replace function kb_ts_config(p_language text) returns regconfig
language sql immutable set search_path = public, extensions as $$
  select case when p_language = 'en' then 'english' else 'german' end::regconfig
$$;

/**
 * Einen Artikel in Abschnitte zerlegen.
 *
 * Geteilt wird vor jeder H2-Zeile. Was davor steht, ist die Einleitung und
 * bekommt keine Überschrift. Abschnitte über 1.500 Zeichen werden an
 * Absatzgrenzen weitergeteilt — die Grenze ist grosszügig gewählt: lieber ein
 * langer Abschnitt mit vollständigem Gedanken als drei kurze, von denen keiner
 * die Frage beantwortet.
 */
create or replace function kb_rebuild_chunks(p_article_id uuid) returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_a kb_article%rowtype; v_part text; v_head text; v_body text; v_cfg regconfig;
  v_i integer := 0; v_buf text; v_para text;
begin
  delete from kb_chunk where article_id = p_article_id;
  select * into v_a from kb_article where id = p_article_id;
  if not found or v_a.status <> 'published' then return 0; end if;
  v_cfg := kb_ts_config(v_a.language);

  for v_part in
    select t from regexp_split_to_table(coalesce(v_a.body_md, ''), E'\n(?=##\\s)') t
  loop
    if btrim(coalesce(v_part, '')) = '' then continue; end if;
    if v_part ~ '^##\s' then
      v_head := btrim(regexp_replace(split_part(v_part, E'\n', 1), '^#+\s*', ''));
      v_body := btrim(substr(v_part, coalesce(nullif(strpos(v_part, E'\n'), 0), length(v_part) + 1)));
    else
      v_head := null;
      v_body := btrim(v_part);
    end if;
    if v_body = '' and v_head is null then continue; end if;

    -- Lange Abschnitte an Absatzgrenzen teilen. Die Überschrift steht als
    -- eigene Spalte und wandert damit von selbst in jedes Teilstück.
    v_buf := '';
    for v_para in select p from regexp_split_to_table(v_body, E'\n\\s*\n') p loop
      if length(v_buf) > 0 and length(v_buf) + length(v_para) > 1500 then
        v_i := v_i + 1;
        insert into kb_chunk (article_id, section_index, heading, body, language, ts)
        values (p_article_id, v_i, v_head, v_buf, v_a.language,
                to_tsvector(v_cfg, coalesce(v_a.title, '') || ' ' || coalesce(v_head, '') || ' ' || v_buf));
        v_buf := v_para;
      else
        v_buf := case when v_buf = '' then v_para else v_buf || E'\n\n' || v_para end;
      end if;
    end loop;
    if btrim(v_buf) <> '' or v_head is not null then
      v_i := v_i + 1;
      insert into kb_chunk (article_id, section_index, heading, body, language, ts)
      values (p_article_id, v_i, v_head, v_buf, v_a.language,
              to_tsvector(v_cfg, coalesce(v_a.title, '') || ' ' || coalesce(v_head, '') || ' ' || v_buf));
    end if;
  end loop;
  return v_i;
end $$;
revoke execute on function kb_rebuild_chunks(uuid) from public, anon, authenticated;

create or replace function trg_kb_article_chunks() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform kb_rebuild_chunks(new.id);
  return new;
end $$;
revoke execute on function trg_kb_article_chunks() from public, anon, authenticated;

drop trigger if exists trg_kb_article_chunks on kb_article;
create trigger trg_kb_article_chunks after insert or update of body_md, title, language, status
  on kb_article for each row execute function trg_kb_article_chunks();

-- Bestand einmal aufbauen (Entwürfe liefern null Abschnitte — gewollt).
do $$
declare r record;
begin
  for r in select id from kb_article loop perform kb_rebuild_chunks(r.id); end loop;
end $$;

-- ---------------------------------------------------------------- Zähler

create table if not exists kb_rate_limit (
  auth_user_id uuid not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  -- Wie viele Protokollzeilen zu diesen Slots schon geschrieben wurden.
  -- Ohne diese Spalte wäre `kb_log_question` ein offenes Schreibrecht auf das
  -- Protokoll: die RPC steht jedem angemeldeten Konto zur Verfügung, und wer
  -- sie direkt aufruft, hätte die Suche und damit den Zähler übersprungen
  -- (Review Architektur-Session 17.09.).
  logged       integer not null default 0,
  primary key (auth_user_id, window_start)
);
alter table kb_rate_limit add column if not exists logged integer not null default 0;
comment on table kb_rate_limit is
  'Fragenzähler des Wissens-Assistenten je Konto und Stunde (0108). Bewusst getrennt von kb_question_log: der Zähler weiss, wer fragt, das Protokoll nicht — die beiden werden nie verbunden.';
alter table kb_rate_limit enable row level security;
revoke all on kb_rate_limit from anon, authenticated;

-- ---------------------------------------------------------------- Protokoll

create table if not exists kb_question_log (
  id          bigint generated always as identity primary key,
  audience    text not null,
  language    text not null,
  question    text not null,
  article_ids uuid[] not null default '{}',
  hit         boolean not null,
  duration_ms integer,
  created_at  timestamptz not null default now()
);
create index if not exists kb_question_log_created_idx on kb_question_log (created_at desc);
comment on table kb_question_log is
  'Was gefragt wurde, ohne wer (0108). Zweck: Wiki-Pflege — Fragen ohne Treffer sind die Luecken. Keine person_id, keine Antworttexte. Rollierend 90 Tage (purge_kb_questions).';
alter table kb_question_log enable row level security;
revoke all on kb_question_log from anon, authenticated;

-- ---------------------------------------------------------------- Suchen

/** Nur-Kiosk-Konto: ein Gerät am Eingang, kein Mensch mit Fragen. */
create or replace function is_kiosk_only() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from role_assignment ra
                  where ra.person_id = current_person_id() and ra.role = 'checkin_operator'
                    and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()))
     and not exists (select 1 from role_assignment ra
                      where ra.person_id = current_person_id() and ra.role <> 'checkin_operator'
                        and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()))
$$;
revoke execute on function is_kiosk_only() from public, anon, authenticated;

/**
 * Die Abschnitte zu einer Frage.
 *
 * Dieselben Sichtbarkeitsregeln wie `kb_articles`: nur veröffentlicht, nur die
 * eigene Zielgruppe, nicht abgelaufen, Edition überlagert evergreen, Sprache
 * mit Rückfall. Ein Abschnitt, den man auf der Wiki-Seite nicht lesen dürfte,
 * darf auch nicht über den Assistenten herausfallen.
 */
create or replace function kb_search(
  p_query text, p_audience text, p_language text default 'de',
  p_edition_id uuid default null, p_limit integer default 6)
returns table (article_id uuid, slug text, title text, heading text, body text,
               language text, is_overlay boolean, rank real)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_lang text; v_cfg regconfig; v_q tsquery; v_text text;
begin
  if auth.uid() is null then raise exception 'not allowed' using errcode = '28000'; end if;
  if is_kiosk_only() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not (my_kb_audiences() && array[p_audience]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_text := btrim(coalesce(p_query, ''));
  if v_text = '' then raise exception 'empty_query' using errcode = '22023'; end if;

  v_lang := case when p_language in ('de', 'en') then p_language else 'de' end;
  v_cfg := kb_ts_config(v_lang);
  -- `websearch_to_tsquery` nimmt die Eingabe so, wie Menschen suchen, und
  -- wirft bei Sonderzeichen nicht — anders als `to_tsquery`.
  v_q := websearch_to_tsquery(v_cfg, v_text);
  if v_q is null or v_q::text = '' then raise exception 'empty_query' using errcode = '22023'; end if;

  return query
    select c.article_id, a.slug, a.title, c.heading, c.body, c.language,
           a.edition_id is not null, ts_rank_cd(c.ts, v_q)
      from kb_chunk c
      join kb_article a on a.id = c.article_id
     where a.status = 'published'
       and a.audience && array[p_audience]
       and (a.valid_until is null or a.valid_until > now())
       and (a.edition_id is null or a.edition_id = p_edition_id)
       and c.ts @@ v_q
     order by (a.language = v_lang) desc, a.edition_id nulls last, ts_rank_cd(c.ts, v_q) desc
     limit greatest(1, least(coalesce(p_limit, 6), 12));
end $$;

-- ---------------------------------------------------------------- Zählen

/**
 * Eine Frage anmelden. Gibt den Reststand zurück, damit die Oberfläche warnen
 * kann, bevor die Grenze erreicht ist.
 */
create or replace function kb_take_question_slot(p_limit integer default 20) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_win timestamptz; v_hits integer;
begin
  if v_uid is null then raise exception 'not allowed' using errcode = '28000'; end if;
  v_win := date_trunc('hour', now());
  insert into kb_rate_limit (auth_user_id, window_start, hits) values (v_uid, v_win, 1)
  on conflict (auth_user_id, window_start) do update set hits = kb_rate_limit.hits + 1
  returning hits into v_hits;
  if v_hits > p_limit then
    raise exception 'rate_limited' using errcode = 'P0001', detail = p_limit::text;
  end if;
  return jsonb_build_object('used', v_hits, 'left', greatest(0, p_limit - v_hits));
end $$;

/** Was gefragt wurde — ohne wer. */
/**
 * Was gefragt wurde — ohne wer, und **nur zu einer wirklich gestellten Frage**.
 *
 * Die RPC steht jedem angemeldeten Konto offen; ohne Bindung an den Zähler
 * wäre das Protokoll beliebig beschreibbar, und die Auswertung, aus der die
 * Wiki-Pflege ihre Lücken liest, wäre wertlos. Gezählt wird deshalb gegen
 * denselben Slot: höchstens so viele Zeilen wie genommene Slots in dieser
 * Stunde. Die Verbindung besteht **nur** in dieser Zahl — welche Zeile zu
 * welchem Konto gehört, weiss danach niemand mehr.
 */
create or replace function kb_log_question(
  p_audience text, p_language text, p_question text,
  p_article_ids uuid[] default '{}', p_hit boolean default false, p_duration_ms integer default null)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_ok boolean;
begin
  if v_uid is null then raise exception 'not allowed' using errcode = '28000'; end if;
  update kb_rate_limit set logged = logged + 1
   where auth_user_id = v_uid and window_start = date_trunc('hour', now()) and logged < hits
  returning true into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'no_slot' using errcode = 'P0001';
  end if;
  insert into kb_question_log (audience, language, question, article_ids, hit, duration_ms)
  values (p_audience, coalesce(nullif(p_language, ''), 'de'), left(btrim(p_question), 500),
          coalesce(p_article_ids, '{}'), coalesce(p_hit, false), p_duration_ms);
end $$;

/** Die offenen Fragen fürs Redigieren: was ohne Treffer blieb. */
create or replace function kb_question_report(p_days integer default 30)
returns table (audience text, language text, question text, hit boolean, asked integer, last_asked timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not (has_role('admin') or can_edit_kb_all(array['partner','speaker','talent','volunteer','hackathon'])) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select q.audience, q.language, lower(btrim(q.question)), q.hit,
           count(*)::integer, max(q.created_at)
      from kb_question_log q
     where q.created_at > now() - make_interval(days => greatest(1, p_days))
     group by q.audience, q.language, lower(btrim(q.question)), q.hit
     order by q.hit, count(*) desc, max(q.created_at) desc;
end $$;

-- ---------------------------------------------------------------- Aufräumen

/**
 * Fragen rollierend nach 90 Tagen löschen, Zählerzeilen nach einem Tag.
 *
 * Nicht an die Edition gebunden: die Onboarding-Saison läuft von November bis
 * April, und für die Wiki-Pflege zählen die letzten Wochen, nicht das letzte
 * Jahr (Architektur-Session 17.09.).
 */
create or replace function purge_kb_questions(p_days integer default 90) returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_n integer;
begin
  if not (auth.uid() is null or has_role('admin') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from kb_question_log where created_at < now() - make_interval(days => greatest(1, p_days));
  get diagnostics v_n = row_count;
  delete from kb_rate_limit where window_start < now() - interval '24 hours';
  return v_n;
end $$;

create or replace function run_application_housekeeping() returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_expired integer; v_promoted integer := 0; v_reminders integer; v_free integer; v_n integer;
        r record; v_partner jsonb; v_volunteers jsonb; v_diet integer; v_questions integer;
begin
  if not (auth.uid() is null or has_role('admin') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_expired := expire_overdue_applications();
  for r in
    select s.id, s.capacity
    from session s
    where s.access_mode = 'application' and s.capacity is not null
      and exists (select 1 from decision_release d where d.session_id = s.id)
      and exists (select 1 from application a where a.session_id = s.id and a.status = 'waitlisted')
  loop
    select r.capacity - count(*) into v_free
      from application a where a.session_id = r.id and a.status in ('accepted', 'promoted', 'confirmed');
    if v_free > 0 then
      v_n := promote_waitlist(r.id, v_free);
      v_promoted := v_promoted + coalesce(v_n, 0);
    end if;
  end loop;
  v_reminders := send_presentation_reminders();
  v_partner := run_partner_housekeeping();
  v_volunteers := run_volunteer_housekeeping();
  v_diet := purge_diet_data();
  v_questions := purge_kb_questions();
  if v_expired > 0 or v_promoted > 0 then
    insert into audit_log (action, object_type, object_id, after)
    values ('application.housekeeping', 'system', 'cron', jsonb_build_object('expired', v_expired, 'promoted', v_promoted));
  end if;
  return jsonb_build_object('expired', v_expired, 'promoted', v_promoted, 'reminders', v_reminders,
                            'partner', v_partner, 'volunteers', v_volunteers, 'diet_purged', v_diet,
                            'questions_purged', v_questions);
end $$;

select harden_definer_functions();
