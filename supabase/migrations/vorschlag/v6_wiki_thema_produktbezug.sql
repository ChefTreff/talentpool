-- 00NN · Wiki: Thema und Produktbezug am Artikel (ADM-064 + PART-103)
--
-- Anlass: PART-058 (#315) gruppiert die Wiki-Liste nach Thema; die Zuordnung stand übergangsweise im
-- Code (`lib/wiki/kategorien.ts`, Slug → Thema). ADM-064: das Thema wird ein Datenfeld, im Editor
-- wählbar. PART-103 (Konrad und Leopold 05.10.): Artikel nach gebuchten Leistungen filtern — ein
-- Masterclass-Artikel nur für Partner mit Masterclass, allgemeine Artikel für alle.
--
-- Umsetzung (ein Migrationsvorschlag, Partner-Chat baut den Portal-Filter danach):
--   * Vokabular `wiki_category` (DE/EN, Reihenfolge = `sort_order`): die sieben Themen aus PART-058.
--     „Weitere Artikel“ ist kein Begriff, sondern das Fehlen eines Themas (NULL).
--   * `kb_article.category` (Schlüssel aus `wiki_category`, NULL = kein Thema) und
--     `kb_article.product_formats text[]` (Schlüssel aus dem Vokabular `partner_format`, dasselbe wie
--     `product.format_key`; leer = für alle). Format statt SKU: Partner buchen verschiedene Artikel
--     desselben Formats, der Artikel „Masterclass“ gilt für alle. Beide in `vocab_binding`, damit ein
--     benutzter Begriff nicht gelöscht wird.
--   * Bestand: `category` aus der bisherigen Slug-Zuordnung; Produktbezug nur für drei eindeutige
--     Artikel (masterclasses → masterclass, company-tours → company_tour, sponsored-talk → talk) —
--     alles andere bleibt für alle sichtbar, Konrad ändert es im Editor.
--   * `upsert_kb_article` (Live-Fassung aus dem Snapshot) nimmt `category` und `product_formats` an
--     (nur wenn der Schlüssel mitkommt; `invalid_category`, `invalid_format`).
--   * `kb_articles`, `kb_article_by_slug`, `kb_articles_admin` geben beide Felder zurück (Rückgabetyp
--     ändert sich ⇒ drop + create). `kb_articles` und `kb_article_by_slug` bekommen `p_formats text[]`
--     (Vorgabe NULL = kein Produktfilter): sichtbar ist ein Artikel ohne Produktbezug oder mit
--     Überschneidung. **Der Filter wirkt nach der Wahl Edition-vor-evergreen** — ein Overlay mit
--     Produktbezug blendet den allgemeinen Artikel nicht wieder ein. **Das ist Relevanz, kein
--     Zugriffsschutz:** die Zielgruppenprüfung (`my_kb_audiences`) bleibt unverändert, und wer
--     `p_formats` weglässt, sieht alle Artikel seiner Zielgruppe.
--
-- Fehlerschlüssel: 28000 · 42501 · 22023 `invalid_category`, `invalid_format` (plus die bisherigen) ·
-- P0002 `article_not_found` · P0001 `slug_taken`.
set search_path = public, extensions;

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('wiki_category', 'summit',       'Summit & Anreise',         'Summit & getting here',  10, true),
  ('wiki_category', 'stand',        'Stand & Aufbau',           'Booth & setup',          20, true),
  ('wiki_category', 'vorort',       'Vor Ort',                  'On site',                30, true),
  ('wiki_category', 'programm',     'Programm & Formate',       'Programme & formats',    40, true),
  ('wiki_category', 'sichtbarkeit', 'Sichtbarkeit & Marketing', 'Visibility & marketing', 50, true),
  ('wiki_category', 'speaking',     'Speaking',                 'Speaking',               60, true),
  ('wiki_category', 'hackathon',    'Hackathon',                'Hackathon',              70, true)
on conflict (vocabulary, key) do nothing;

alter table kb_article add column if not exists category text;
alter table kb_article add column if not exists product_formats text[] not null default '{}';
comment on column kb_article.category is
  'ADM-064: Thema des Artikels (Vokabular wiki_category). NULL = kein Thema, im Portal unter „Weitere Artikel“.';
comment on column kb_article.product_formats is
  'PART-103: Produktbezug (Vokabular partner_format = product.format_key). Leer = für alle Partner; sonst nur für Partner, die ein Produkt dieses Formats gebucht haben. Relevanzfilter, kein Zugriffsschutz.';

insert into vocab_binding (vocabulary, table_name, column_name, is_array, vocabulary_column, note) values
  ('wiki_category',  'kb_article', 'category',        false, null, 'kb_article.category'),
  ('partner_format', 'kb_article', 'product_formats', true,  null, 'kb_article.product_formats')
on conflict do nothing;

-- Bestand: Thema aus der bisherigen Slug-Zuordnung (lib/wiki/kategorien.ts), nur wo noch keines steht.
update kb_article a set category = m.k
  from (values
    ('ueber-cheftreff', 'summit'), ('oeffnungszeiten-ablauf', 'summit'), ('location-anfahrt', 'summit'),
    ('hotel-unterkunft', 'summit'), ('tickets-akkreditierung', 'summit'),
    ('hallenplan-standuebersicht', 'stand'), ('eigenbau-stand-genehmigung', 'stand'), ('messestand-rueckwand', 'stand'),
    ('anlieferung-aufbau', 'stand'), ('anlieferung-lkw', 'stand'), ('messeshop', 'stand'),
    ('help-desk-kiosk', 'vorort'), ('stand-catering', 'vorort'), ('pfand', 'vorort'),
    ('company-tours', 'programm'), ('masterclasses', 'programm'), ('sponsored-talk', 'programm'),
    ('media-kit', 'sichtbarkeit'), ('event-app', 'sichtbarkeit'), ('recruiting-best-practices', 'sichtbarkeit'),
    ('speaker-briefing', 'speaking'), ('talk-guidelines', 'speaking'), ('praesentationen', 'speaking'), ('faq-speaking', 'speaking'),
    ('ai-hackathon-wiki', 'hackathon'), ('hackathon-ablauf-teilnehmende', 'hackathon')
  ) as m(slug, k)
 where a.slug = m.slug and a.category is null;

update kb_article a set product_formats = m.f
  from (values
    ('masterclasses', array['masterclass']), ('company-tours', array['company_tour']), ('sponsored-talk', array['talk'])
  ) as m(slug, f)
 where a.slug = m.slug and cardinality(a.product_formats) = 0;

-- ---------------------------------------------------------------- upsert_kb_article (Live-Fassung + Thema + Produktbezug)

create or replace function upsert_kb_article(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_audience text[]; v_old text[]; v_slug text; v_a text; v_phase text;
  v_cat text; v_formats text[]; v_f text;
begin
  v_id := nullif(p_data->>'id', '')::uuid;
  v_audience := coalesce(
    (select array_agg(value::text) from jsonb_array_elements_text(p_data->'audience') as t(value)),
    '{}');

  if v_id is not null then
    select a.audience into v_old from kb_article a where a.id = v_id;
    if v_old is null then raise exception 'article_not_found' using errcode = 'P0002'; end if;
    -- Wer ändert, muss den Artikel schon jetzt betreuen dürfen — sonst liesse
    -- sich ein fremder Artikel über eine neue Zielgruppenliste übernehmen.
    if not can_edit_kb_all(v_old) then raise exception 'not allowed' using errcode = '42501'; end if;
    if cardinality(v_audience) = 0 then v_audience := v_old; end if;
  end if;
  if cardinality(v_audience) = 0 then
    raise exception 'invalid_audience' using errcode = '22023', detail = 'mindestens eine Zielgruppe';
  end if;
  foreach v_a in array v_audience loop
    if not is_vocab_key('kb_audience', v_a) then
      raise exception 'invalid_audience' using errcode = '22023', detail = v_a;
    end if;
  end loop;
  if not can_edit_kb_all(v_audience) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_phase := coalesce(nullif(p_data->>'phase', ''), 'evergreen');
  if not is_vocab_key('kb_phase', v_phase) then
    raise exception 'invalid_phase' using errcode = '22023', detail = v_phase;
  end if;

  -- ADM-064: Thema des Artikels (Vokabular wiki_category). Leer = kein Thema, im Portal „Weitere“.
  -- Nur gesetzt, wenn der Schlüssel mitkommt: ein Aufruf ohne `category` lässt das Thema stehen.
  if p_data ? 'category' then
    v_cat := nullif(btrim(coalesce(p_data->>'category', '')), '');
    if v_cat is not null and not is_vocab_key('wiki_category', v_cat) then
      raise exception 'invalid_category' using errcode = '22023', detail = v_cat;
    end if;
  end if;
  -- PART-103: Produktbezug (Vokabular partner_format, wie `product.format_key`). Leer = für alle.
  if p_data ? 'product_formats' then
    v_formats := coalesce(
      (select array_agg(distinct btrim(value::text)) from jsonb_array_elements_text(p_data->'product_formats') as t(value)
        where btrim(value::text) <> ''),
      '{}');
    foreach v_f in array v_formats loop
      if not is_vocab_key('partner_format', v_f) then
        raise exception 'invalid_format' using errcode = '22023', detail = v_f;
      end if;
    end loop;
  end if;

  if v_id is null then
    v_slug := nullif(btrim(p_data->>'slug'), '');
    if v_slug is null then
      raise exception 'invalid_slug' using errcode = '22023', detail = 'Slug fehlt';
    end if;
    insert into kb_article (slug, edition_id, language, audience, roles, phase, title, body_md,
                            status, valid_until, owner_person_id, sort_order, updated_by, category, product_formats)
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
            current_person_id(), v_cat, coalesce(v_formats, '{}'))
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
      category = case when p_data ? 'category' then v_cat else category end,
      product_formats = case when p_data ? 'product_formats' then coalesce(v_formats, '{}') else product_formats end,
      updated_by = current_person_id(),
      updated_at = now()
    where id = v_id;
    if not found then raise exception 'article_not_found' using errcode = 'P0002'; end if;
  end if;

  perform log_audit('kb.article_saved', 'kb_article', v_id::text, null,
                    jsonb_build_object('slug', coalesce(v_slug, p_data->>'slug'), 'audience', v_audience,
                                       'category', v_cat, 'product_formats', to_jsonb(v_formats)));
  return v_id;
exception when unique_violation then
  raise exception 'slug_taken' using errcode = 'P0001',
    detail = 'Für diesen Slug, diese Sprache und diese Edition gibt es den Artikel schon';
end $$;


-- ---------------------------------------------------------------- Lesen (Rückgabetyp ändert sich ⇒ drop + create)

drop function if exists kb_article_by_slug(text, text, text, uuid);
drop function if exists kb_articles(text, text, uuid, text);
drop function if exists kb_articles_admin(text);

create function kb_articles(p_audience text, p_language text DEFAULT 'de'::text, p_edition_id uuid DEFAULT NULL::uuid, p_role text DEFAULT NULL::text, p_formats text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, slug text, title text, body_md text, phase text, roles text[], language text, edition_id uuid, updated_at timestamp with time zone, is_overlay boolean, category text, product_formats text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_allowed text[]; v_lang text;
begin
  if auth.uid() is null then raise exception 'not allowed' using errcode = '28000'; end if;
  v_allowed := my_kb_audiences();
  if not (v_allowed && array[p_audience]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Unbekannte Sprache ist kein Fehler, sondern Deutsch: der Aufrufer ist der
  -- Locale-String des Browsers, und eine Ausnahme hülfe dem Leser nicht.
  v_lang := case when p_language in ('de', 'en') then p_language else 'de' end;
  return query
    select k.id, k.slug, k.title, k.body_md, k.phase, k.roles, k.language, k.edition_id,
           k.updated_at, k.is_overlay, k.category, k.product_formats
      from (
        select distinct on (a.slug)
               a.id, a.slug, a.title, a.body_md, a.phase, a.roles, a.language, a.edition_id,
               a.updated_at, a.edition_id is not null as is_overlay, a.category, a.product_formats
          from kb_article a
         where a.status = 'published'
           and a.audience && array[p_audience]
           and (a.valid_until is null or a.valid_until > now())
           -- `a.edition_id = p_edition_id` ist NULL, wenn keine Edition gefragt ist —
           -- dann bleibt nur der evergreen übrig. Mit `p_edition_id is null` als
           -- drittem Oder-Zweig hätte die Überlagerung einer **alten** Edition
           -- gewonnen, sobald niemand eine Edition mitgibt.
           and (a.edition_id is null or a.edition_id = p_edition_id)
           and (p_role is null or cardinality(a.roles) = 0 or a.roles && array[p_role])
         -- Edition vor evergreen, dann Wunschsprache vor der anderen.
         order by a.slug, a.edition_id nulls last, (a.language = v_lang) desc, a.sort_order
      ) k
     -- PART-103: Produktbezug **nach** der Wahl Edition-vor-evergreen, sonst blendete ein Overlay
     -- mit Produktbezug den allgemeinen Artikel wieder ein. NULL = kein Produktfilter.
     where p_formats is null or cardinality(k.product_formats) = 0 or k.product_formats && p_formats;
end $$;

create function kb_article_by_slug(p_slug text, p_audience text, p_language text DEFAULT 'de'::text, p_edition_id uuid DEFAULT NULL::uuid, p_formats text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, slug text, title text, body_md text, phase text, roles text[], language text, edition_id uuid, updated_at timestamp with time zone, is_overlay boolean, category text, product_formats text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  return query select * from kb_articles(p_audience, p_language, p_edition_id, null, p_formats) k where k.slug = p_slug;
end $$;

create function kb_articles_admin(p_audience text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, slug text, title text, body_md text, phase text, roles text[], audience text[], language text, edition_id uuid, edition_slug text, status text, valid_until timestamp with time zone, owner_name text, updated_at timestamp with time zone, published_at timestamp with time zone, category text, product_formats text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (has_role('admin') or can_edit_kb(array['partner','speaker','talent','volunteer','hackathon'])) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select a.id, a.slug, a.title, a.body_md, a.phase, a.roles, a.audience, a.language,
           a.edition_id, e.slug, a.status, a.valid_until,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           a.updated_at, a.published_at, a.category, a.product_formats
      from kb_article a
      left join event e on e.id = a.edition_id
      left join person p on p.id = a.owner_person_id
     where (p_audience is null or a.audience && array[p_audience])
       -- Nur Artikel, deren Zielgruppen diese Person alle betreut.
       and can_edit_kb_all(a.audience)
     order by a.slug, a.language, a.edition_id nulls first;
end $$;

select harden_definer_functions();
