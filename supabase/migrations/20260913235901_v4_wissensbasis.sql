-- 0083 · Wissensbasis: Artikel je Zielgruppe, Overlay je Edition (Welle 4 A5).
--
-- Ein Artikel gilt so lange, bis ihn einer für die laufende Edition überlagert.
-- Das ist der Kern: das Volunteer-Wiki aus Notion beschreibt Rollen, die jedes
-- Jahr gleich sind („Was macht der Bereich Einlass?"), und daneben stehen
-- Sätze, die jedes Jahr anders sind („Treffpunkt Freitag 8:00, Halle B").
-- Ohne Overlay müsste man jedes Jahr alles kopieren und am Ende weiss niemand,
-- welche Fassung gilt. Mit Overlay bleibt der evergreen-Artikel die Wahrheit,
-- und die Edition legt nur das Abweichende darüber.
--
-- Zielgruppen sind **Rechte, nicht Etiketten**: `kb_articles()` gibt nur heraus,
-- was zu den Rollen der fragenden Person passt. Ein Partner sieht keinen
-- Volunteer-Artikel, auch wenn er die Adresse kennt.
--
-- Fehlerschlüssel: 42501, P0002 `article_not_found`, 22023 `invalid_<x>`,
-- P0001 `slug_taken`.
--
-- Abweichungen: keine. `kb_chunk`/pgvector und der Chatbot bleiben Welle 5.
set search_path = public, extensions;

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('kb_audience', 'partner',   'Partner',      'Partners',     1, true),
  ('kb_audience', 'speaker',   'Speaker',      'Speakers',     2, true),
  ('kb_audience', 'talent',    'Teilnehmende', 'Participants', 3, true),
  ('kb_audience', 'volunteer', 'Volunteers',   'Volunteers',   4, true),
  ('kb_audience', 'hackathon', 'Hackathon',    'Hackathon',    5, true),
  ('kb_phase', 'evergreen', 'Jederzeit',   'Anytime',        1, true),
  ('kb_phase', 'vor',       'Vor dem Event', 'Before',       2, true),
  ('kb_phase', 'aufbau',    'Aufbau',      'Set-up',         3, true),
  ('kb_phase', 'event',     'Während',     'During',         4, true),
  ('kb_phase', 'abbau',     'Abbau',       'Tear-down',      5, true)
on conflict (vocabulary, key) do nothing;

create table if not exists kb_article (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null,
  -- NULL = evergreen. Ein Artikel mit Edition überlagert den evergreen gleichen Slugs.
  edition_id       uuid references event(id) on delete cascade,
  language         text not null default 'de',
  audience         text[] not null default '{}',
  roles            text[] not null default '{}',
  phase            text not null default 'evergreen',
  title            text not null,
  body_md          text not null default '',
  status           text not null default 'draft',
  valid_until      timestamptz,
  owner_person_id  uuid references person(id) on delete set null,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references person(id) on delete set null,
  published_at     timestamptz,
  constraint kb_article_status_chk check (status in ('draft', 'published', 'archived')),
  constraint kb_article_language_chk check (language in ('de', 'en')),
  constraint kb_article_audience_chk check (cardinality(audience) > 0)
);

-- Je Slug, Sprache und Edition genau ein Artikel. Der evergreen-Artikel hat
-- edition_id NULL — deshalb zwei Indizes: der partielle fängt NULL, das
-- normale UNIQUE fasst NULL nicht.
create unique index if not exists kb_article_slug_edition_idx
  on kb_article (slug, language, edition_id) where edition_id is not null;
create unique index if not exists kb_article_slug_evergreen_idx
  on kb_article (slug, language) where edition_id is null;
create index if not exists kb_article_audience_idx on kb_article using gin (audience);
create index if not exists kb_article_roles_idx on kb_article using gin (roles);

comment on table kb_article is
  'Wissensbasis. `edition_id` NULL = jahresunabhängig; ein Artikel mit Edition überlagert ihn für diese Edition.';
comment on column kb_article.roles is
  'Nur für Volunteers: Rollen-Seiten aus dem Notion-Wiki. Leer heisst „für alle der Zielgruppe".';

alter table kb_article enable row level security;
revoke all on kb_article from anon, authenticated;
grant all on kb_article to service_role;

-- ---------------------------------------------------------------- Rechte

/**
 * Welche Wikis darf diese Person lesen?
 *
 * Aus den Rollen abgeleitet, nicht aus einem Parameter — sonst könnte jeder
 * jedes Wiki anfragen. Das Teilnehmer-Wiki steht jeder angemeldeten Person
 * offen; alles andere braucht die passende Rolle. Das Team sieht alles, weil
 * es alles betreut.
 */
create or replace function my_kb_audiences() returns text[]
language sql stable security definer set search_path = public, extensions as $$
  select case when is_staff() then array['partner','speaker','talent','volunteer','hackathon']
  else array_remove(array[
    'talent',
    case when has_role('partner_contact') or has_role('standbuehne_editor') then 'partner' end,
    case when has_role('speaker') or has_role('speaker_assistant') then 'speaker' end,
    case when has_role('volunteer') or has_role('volunteer_lead') then 'volunteer' end,
    case when has_role('hackathon_participant') or has_role('hackathon_partner') then 'hackathon' end
  ], null) end
$$;

/** Wer Artikel schreiben darf: Admin oder die Bereichsleitung der Zielgruppe. */
create or replace function can_edit_kb(p_audience text[]) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select has_role('admin')
      or (p_audience && array['partner'] and has_role('area_lead_partner'))
      or (p_audience && array['speaker'] and has_role('area_lead_speaker'))
      or (p_audience && array['talent'] and has_role('area_lead_talent'))
      or (p_audience && array['volunteer'] and has_role('area_lead_volunteers'))
      or (p_audience && array['hackathon'] and has_role('area_lead_hackathon'))
$$;

comment on function can_edit_kb(text[]) is
  'Admin oder die Bereichsleitung mindestens einer der Zielgruppen des Artikels.';

-- ---------------------------------------------------------------- Lesen

/**
 * Artikel einer Zielgruppe, mit Overlay.
 *
 * `distinct on (slug)` mit `order by edition_id nulls last` nimmt je Slug den
 * Artikel der Edition, wenn es ihn gibt, sonst den evergreen. Abgelaufene
 * (`valid_until`) und unveröffentlichte fallen vorher weg.
 */
create or replace function kb_articles(
  p_audience text,
  p_language text default 'de',
  p_edition_id uuid default null,
  p_role text default null)
returns table(id uuid, slug text, title text, body_md text, phase text, roles text[],
              language text, edition_id uuid, updated_at timestamptz, is_overlay boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_allowed text[];
begin
  if auth.uid() is null then raise exception 'not allowed' using errcode = '28000'; end if;
  v_allowed := my_kb_audiences();
  if not (v_allowed && array[p_audience]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select distinct on (a.slug)
           a.id, a.slug, a.title, a.body_md, a.phase, a.roles, a.language, a.edition_id,
           a.updated_at, a.edition_id is not null
      from kb_article a
     where a.status = 'published'
       and a.language = p_language
       and a.audience && array[p_audience]
       and (a.valid_until is null or a.valid_until > now())
       -- `a.edition_id = p_edition_id` ist NULL, wenn keine Edition gefragt ist —
       -- dann bleibt nur der evergreen übrig. Mit `p_edition_id is null` als
       -- drittem Oder-Zweig hätte die Überlagerung einer **alten** Edition
       -- gewonnen, sobald niemand eine Edition mitgibt.
       and (a.edition_id is null or a.edition_id = p_edition_id)
       and (p_role is null or cardinality(a.roles) = 0 or a.roles && array[p_role])
     order by a.slug, a.edition_id nulls last, a.sort_order;
end $$;

/** Ein einzelner Artikel über den Slug — derselbe Overlay-Weg. */
create or replace function kb_article_by_slug(
  p_slug text, p_audience text, p_language text default 'de', p_edition_id uuid default null)
returns table(id uuid, slug text, title text, body_md text, phase text, roles text[],
              language text, edition_id uuid, updated_at timestamptz, is_overlay boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  return query select * from kb_articles(p_audience, p_language, p_edition_id) k where k.slug = p_slug;
end $$;

/** Alle Fassungen für den Editor — auch Entwürfe, auch abgelaufene. */
create or replace function kb_articles_admin(p_audience text default null)
returns table(id uuid, slug text, title text, body_md text, phase text, roles text[],
              audience text[], language text, edition_id uuid, edition_slug text,
              status text, valid_until timestamptz, owner_name text,
              updated_at timestamptz, published_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not (has_role('admin') or can_edit_kb(array['partner','speaker','talent','volunteer','hackathon'])) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select a.id, a.slug, a.title, a.body_md, a.phase, a.roles, a.audience, a.language,
           a.edition_id, e.slug, a.status, a.valid_until,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           a.updated_at, a.published_at
      from kb_article a
      left join event e on e.id = a.edition_id
      left join person p on p.id = a.owner_person_id
     where (p_audience is null or a.audience && array[p_audience])
       -- Nur Zielgruppen, die diese Person auch betreut.
       and can_edit_kb(a.audience)
     order by a.slug, a.language, a.edition_id nulls first;
end $$;

-- ---------------------------------------------------------------- Schreiben

create or replace function upsert_kb_article(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid; v_audience text[]; v_slug text; v_a text; v_phase text;
begin
  v_id := nullif(p_data->>'id', '')::uuid;
  v_audience := coalesce(
    (select array_agg(value::text) from jsonb_array_elements_text(p_data->'audience') as t(value)),
    '{}');

  if v_id is not null and cardinality(v_audience) = 0 then
    select a.audience into v_audience from kb_article a where a.id = v_id;
  end if;
  if cardinality(v_audience) = 0 then
    raise exception 'invalid_audience' using errcode = '22023', detail = 'mindestens eine Zielgruppe';
  end if;
  foreach v_a in array v_audience loop
    if not is_vocab_key('kb_audience', v_a) then
      raise exception 'invalid_audience' using errcode = '22023', detail = v_a;
    end if;
  end loop;
  if not can_edit_kb(v_audience) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_phase := coalesce(nullif(p_data->>'phase', ''), 'evergreen');
  if not is_vocab_key('kb_phase', v_phase) then
    raise exception 'invalid_phase' using errcode = '22023', detail = v_phase;
  end if;

  if v_id is null then
    v_slug := nullif(btrim(p_data->>'slug'), '');
    if v_slug is null then
      raise exception 'invalid_slug' using errcode = '22023', detail = 'Slug fehlt';
    end if;
    insert into kb_article (slug, edition_id, language, audience, roles, phase, title, body_md,
                            status, valid_until, owner_person_id, sort_order, updated_by)
    values (v_slug, nullif(p_data->>'edition_id', '')::uuid,
            coalesce(nullif(p_data->>'language', ''), 'de'), v_audience,
            coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_data->'roles') as t(value)), '{}'),
            v_phase,
            coalesce(nullif(btrim(p_data->>'title'), ''), v_slug),
            coalesce(p_data->>'body_md', ''),
            coalesce(nullif(p_data->>'status', ''), 'draft'),
            nullif(p_data->>'valid_until', '')::timestamptz,
            coalesce(nullif(p_data->>'owner_person_id', '')::uuid, current_person_id()),
            coalesce((p_data->>'sort_order')::integer, 0),
            current_person_id())
    returning id into v_id;
  else
    update kb_article set
      language = coalesce(nullif(p_data->>'language', ''), language),
      audience = v_audience,
      roles = case when p_data ? 'roles'
                   then coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_data->'roles') as t(value)), '{}')
                   else roles end,
      phase = v_phase,
      title = coalesce(nullif(btrim(p_data->>'title'), ''), title),
      body_md = coalesce(p_data->>'body_md', body_md),
      valid_until = case when p_data ? 'valid_until' then nullif(p_data->>'valid_until', '')::timestamptz else valid_until end,
      owner_person_id = coalesce(nullif(p_data->>'owner_person_id', '')::uuid, owner_person_id),
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order),
      updated_by = current_person_id(),
      updated_at = now()
    where id = v_id;
    if not found then raise exception 'article_not_found' using errcode = 'P0002'; end if;
  end if;

  perform log_audit('kb.article_saved', 'kb_article', v_id::text, null,
                    jsonb_build_object('slug', coalesce(v_slug, p_data->>'slug'), 'audience', v_audience));
  return v_id;
exception when unique_violation then
  raise exception 'slug_taken' using errcode = 'P0001',
    detail = 'Für diesen Slug, diese Sprache und diese Edition gibt es den Artikel schon';
end $$;

create or replace function publish_kb_article(p_id uuid, p_published boolean default true) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_audience text[];
begin
  select a.audience into v_audience from kb_article a where a.id = p_id;
  if v_audience is null then raise exception 'article_not_found' using errcode = 'P0002'; end if;
  if not can_edit_kb(v_audience) then raise exception 'not allowed' using errcode = '42501'; end if;
  update kb_article
     set status = case when p_published then 'published' else 'draft' end,
         published_at = case when p_published then now() else null end,
         updated_by = current_person_id(), updated_at = now()
   where id = p_id;
  perform log_audit(case when p_published then 'kb.published' else 'kb.unpublished' end,
                    'kb_article', p_id::text, null, null);
end $$;

create or replace function delete_kb_article(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_audience text[];
begin
  select a.audience into v_audience from kb_article a where a.id = p_id;
  if v_audience is null then raise exception 'article_not_found' using errcode = 'P0002'; end if;
  if not can_edit_kb(v_audience) then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Nicht löschen, archivieren: ein Wiki-Artikel ist Wissen, kein Wegwerfartikel.
  update kb_article set status = 'archived', updated_by = current_person_id(), updated_at = now()
   where id = p_id;
  perform log_audit('kb.archived', 'kb_article', p_id::text, null, null);
end $$;

select harden_definer_functions();
