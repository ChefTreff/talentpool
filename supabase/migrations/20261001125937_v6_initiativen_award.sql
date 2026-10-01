-- 0240 · Initiativen-Funnel mit Verlauf, Stand-Tage, Initiativen-Award mit öffentlicher Abstimmung ohne Personendaten (ADM-022, ADM-024)
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001125937.
-- Initiativen: Funnel-Verlauf mit Notiz, Stand-Tage am Produkt; Initiativen-Award mit öffentlicher Bewerbung und Abstimmung (ADM-022, ADM-024)
--
-- **ADM-022 — was schon da ist und bleibt:** Funnel als `org_edition.pipeline_stage`
-- mit `set_initiative_stage` und Audit (0116), die Leistungen INI-PARTNERSCHAFT
-- (Checkliste mit Beschreibung und Volunteer-Zusage), INI-BEACHFLAG (Pflicht
-- `beachflag_print` als Upload — der vorhandene Deliverable-Weg),
-- INI-STAND-1T/-2T (0116), Rabattstufen je Kontingent
-- (`org_ticket_allocation.discount_percent` in (50, 100), 0123) und Stände
-- tageweise (`booth_assignment.event_day_id`, 0124). Ein zweiter Rabattsatz am
-- Produkt wäre eine zweite Wahrheit neben dem Kontingent — deshalb keiner.
--
-- **ADM-022 — neu:**
--   * `initiative_stage_log`: jeder Stufenwechsel mit Notiz, Zeit und Person —
--     der Verlauf eines CRM. Die aktuelle Stufe bleibt in `pipeline_stage`
--     (seit 0116 gelesen von Liste und Oberfläche); die Tabelle ist der Verlauf,
--     keine zweite aktuelle Stufe.
--   * `set_initiative_stage(org_edition, stage, note)`: dritter Parameter, schreibt
--     den Verlauf. Basis: snapshot/functions/set_initiative_stage.sql; die alte
--     Zwei-Parameter-Fassung fällt (sonst zwei Überladungen).
--   * `initiative_stage_history(org_edition)`: der Verlauf, Abschnitt `initiatives`.
--   * `product.stand_days` (1 oder 2): ein Stand für einen oder für beide Tage —
--     für Produktionsliste und Standcheckliste (PROD-004/005). INI-STAND-1T = 1,
--     übrige Standflächen = 2. `upsert_product` nimmt das Feld an (Basis:
--     snapshot/functions/upsert_product.sql, neu nur die Prüfung und die Spalte).
--
-- **ADM-024 — der Award:** Bewerbung nach dem Airtable-Formular „FLS Initiativen
-- Award", öffentliche Abstimmung ohne Login, Auswertung im Admin.
--   * `award_application` — die Felder des Formulars, optional verknüpft mit
--     einer `organization` (Initiativen, die auch Partner sind). Bilder im
--     privaten Bucket `award-images`.
--   * `award_vote` — **ohne Personendaten**: `voter_hash` = sha256 aus dem
--     vorgehashten Wert der Route, der Edition und einem Salz, gebildet **in**
--     der Datenbank; die Adresse selbst wird nirgends gespeichert. Eine Stimme
--     je Hash und Bewerbung.
--   * `award_secret` — das Salz je Edition, zufällig erzeugt, nur für die
--     Funktionen lesbar. Keine Umgebungsvariable nötig.
--   * Öffentliche Wege laufen **nicht** als anon-RPC (`harden_definer_functions`
--     entzieht anon das EXECUTE, und das ist richtig so): `award_apply`,
--     `award_set_images`, `award_vote_cast`, `award_public_entries` sind
--     Server-Funktionen (`auth.uid()` gesetzt ⇒ 42501, EXECUTE nur
--     service_role) und werden von Server-Routen mit Ratenbegrenzung gerufen.
--   * Ratenbegrenzung je Hash: höchstens drei Bewerbungen am Tag, dreissig
--     Stimmen in der Stunde — `rate_limited`.
--   * **Die IP-Adresse erreicht die Datenbank nie im Klartext** (Auflage der
--     Architektur-Session, 01.10.): Postgres protokolliert bei jedem `raise`
--     das Statement samt Parametern (`log_min_error_statement`), und
--     Ratenbegrenzung, Frist vorbei, Doppelstimme oder ein vergessenes Feld
--     sind erwartete Zustände, die ständig eintreten. Deshalb (a) hasht die
--     Route die Adresse in Node vor (`sha256(ip)`, 64 Hex-Zeichen) und die
--     Datenbank hasht mit Edition und Salz erneut, und (b) melden die
--     öffentlichen Funktionen erwartete Zustände als **Rückgabewert**
--     (`ok`, `invalid`, `closed`, `rate_limited`, `duplicate`, `not_votable`,
--     `not_found`) — `raise` nur für echte Fehler. So steht selbst in einem
--     unerwarteten Fehler nie die Klartext-Adresse.
--   * Fristen als `deadline`-Zeilen der Edition (`award_apply_until`,
--     `award_vote_from`, `award_vote_until`, Zielgruppe `award`) mit
--     **Platzhalterdatum** — Konrad trägt die echten Termine unter /admin/fristen
--     ein. Die Zielgruppe `award` taucht in keinem Partner- oder Speaker-Countdown auf.
--   * Admin: Liste mit Kontaktdaten und Stimmen, Status (submitted → accepted →
--     finalist/winner oder rejected) mit Audit, Verknüpfung mit einer
--     Organisation, Löschen (Bilder in die Aufräum-Warteschlange). Abschnitt
--     `initiatives`.
--   * Öffentlich sichtbar sind nur angenommene Bewerbungen und nur ihre
--     inhaltlichen Felder — nie die Ansprechperson. Zwischenstände der
--     Abstimmung sind nicht öffentlich.
--
-- Fehlerschlüssel (Admin und Funnel): 28000 · 42501 · 22023 `invalid_state`,
-- `invalid_stand_days`, `text_too_long` · P0002 `application_not_found`,
-- `org_edition_not_found`, `org_not_found`. Die öffentlichen Funktionen geben
-- Zustände zurück (siehe oben) und werfen nur 42501 bei einem Aufruf mit Sitzung.
set search_path = public, extensions;

-- =============================================================================
-- ADM-022
-- =============================================================================

create table initiative_stage_log (
  id             uuid primary key default gen_random_uuid(),
  org_edition_id uuid not null references org_edition (id) on delete cascade,
  stage          text,
  note           text check (note is null or char_length(note) <= 2000),
  changed_at     timestamptz not null default now(),
  changed_by     uuid references person (id) on delete set null
);
create index initiative_stage_log_oe_idx on initiative_stage_log (org_edition_id, changed_at desc);
alter table initiative_stage_log enable row level security;
revoke all on initiative_stage_log from anon, authenticated;
grant all on initiative_stage_log to service_role;
comment on table initiative_stage_log is
  'ADM-022: Verlauf des Initiativen-Funnels — je Stufenwechsel oder Notiz eine Zeile. Die aktuelle Stufe steht in org_edition.pipeline_stage.';

drop function if exists set_initiative_stage(uuid, text);
create or replace function set_initiative_stage(p_org_edition_id uuid, p_stage text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_vorher text; v_org uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_stage is not null and p_stage not in
     ('outreach','gespraech','agreement','onboarding','aktiv','abgelehnt') then
    raise exception 'invalid_stage' using errcode = '22023', detail = coalesce(p_stage, 'null');
  end if;
  if char_length(coalesce(v_note, '')) > 2000 then
    raise exception 'text_too_long' using errcode = '22023', detail = 'note';
  end if;
  select oe.pipeline_stage, oe.org_id into v_vorher, v_org
    from org_edition oe where oe.id = p_org_edition_id;
  if not found then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_edition_id::text;
  end if;

  update org_edition set pipeline_stage = p_stage, updated_at = now() where id = p_org_edition_id;

  -- ADM-022: Verlauf. Eine Zeile je Wechsel — und auch ohne Wechsel, wenn eine
  -- Notiz dazukommt (Gesprächsnotiz in derselben Stufe).
  if p_stage is distinct from v_vorher or v_note is not null then
    insert into initiative_stage_log (org_edition_id, stage, note, changed_by)
    values (p_org_edition_id, p_stage, v_note, current_person_id());
  end if;

  perform log_audit('initiative.stage', 'org_edition', p_org_edition_id::text,
                    jsonb_build_object('pipeline_stage', v_vorher),
                    jsonb_build_object('pipeline_stage', p_stage, 'org_id', v_org, 'note', v_note is not null));
end $$;

create or replace function initiative_stage_history(p_org_edition_id uuid)
 RETURNS TABLE(stage text, note text, changed_at timestamp with time zone, changed_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('initiatives') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select l.stage, l.note, l.changed_at,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
      from initiative_stage_log l
      left join person p on p.id = l.changed_by
     where l.org_edition_id = p_org_edition_id
     order by l.changed_at desc
     limit 200;
end $$;

-- Stand-Tage am Produkt ----------------------------------------------------------
alter table product add column stand_days smallint;
alter table product add constraint product_stand_days_chk check (stand_days is null or stand_days in (1, 2));
comment on column product.stand_days is
  'ADM-022: Stand für einen (1) oder beide Tage (2); null = kein Stand. Gelesen von Produktionsliste und Standcheckliste (PROD-004/005).';
update product set stand_days = 1 where sku = 'INI-STAND-1T';
update product set stand_days = 2 where category = 'standflaeche' and sku <> 'INI-STAND-1T' and stand_days is null;

create or replace function upsert_product(p_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sku text := p_data->>'sku'; v_exists boolean;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Zweites Muster fuer Initiativen-Leistungen (siehe `product_sku_check` oben).
  -- Ohne diese Zeile waeren die vier INI-Produkte nur im Studio pflegbar — und
  -- „mal eben im Dashboard“ ist genau das, was die Konventionen verbieten
  -- (Auflage der Architektur-Session, 18.09.).
  if v_sku is null or (v_sku !~ '^I-[0-9]{5}$' and v_sku !~ '^INI-[A-Z0-9-]{3,20}$') then
    raise exception 'invalid_sku' using errcode = '22023';
  end if;
  if p_data ? 'category' and not is_vocab_key('product_category', p_data->>'category') then raise exception 'invalid_category' using errcode = '22023'; end if;
  -- Neu (0110): welche Partner-Seite dieses Produkt oeffnet. Leerer Text heisst
  -- „keine Seite" — sonst liesse sich eine Zuordnung ueber die Oberflaeche nie
  -- wieder entfernen.
  if p_data ? 'format_key' and nullif(btrim(p_data->>'format_key'), '') is not null
     and not is_vocab_key('partner_format', btrim(p_data->>'format_key')) then
    raise exception 'invalid_format' using errcode = '22023', detail = coalesce(p_data->>'format_key', 'null');
  end if;
  -- Neu (0135): welches Sponsoring-Level dieses Produkt vergibt. Wie beim
  -- Formatschluessel heisst leerer Text „kein Level".
  if p_data ? 'sponsoring_level_key' and nullif(btrim(p_data->>'sponsoring_level_key'), '') is not null
     and not is_vocab_key('sponsoring_level', btrim(p_data->>'sponsoring_level_key')) then
    raise exception 'invalid_sponsoring_level' using errcode = '22023', detail = coalesce(p_data->>'sponsoring_level_key', 'null');
  end if;
  -- Neu (ADM-022): Stand fuer einen oder beide Tage; leerer Text heisst „kein Stand".
  if p_data ? 'stand_days' and nullif(btrim(p_data->>'stand_days'), '') is not null
     and btrim(p_data->>'stand_days') not in ('1', '2') then
    raise exception 'invalid_stand_days' using errcode = '22023', detail = p_data->>'stand_days';
  end if;
  if p_data ? 'pass_type' and nullif(p_data->>'pass_type', '') is not null and (p_data->>'pass_type') not in ('partner', 'talent', 'investor') then raise exception 'invalid_pass_type' using errcode = '22023'; end if;
  if p_data ? 'grants_role' and nullif(p_data->>'grants_role', '') is not null and not is_vocab_key('role', p_data->>'grants_role') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select exists (select 1 from product where sku = v_sku) into v_exists;
  if not v_exists then
    insert into product (sku, name_de, name_en, description_de, description_en, type, category, unit, net_price_cents, purchase_price_cents, margin, vat_rate,
                         supplier, supplier_sku, supplier_url, stock_total, track_stock, available_until, shop_visible, shop_sort, late_orderable,
                         shop_hint_de, shop_hint_en, purchase_note_de, purchase_note_en, merch_config, images, source_hubspot, source_shop, internal_comment, active, edition_id,
                         pass_type, grants_role, format_key, sponsoring_level_key, stand_days)
    values (v_sku, p_data->>'name_de', p_data->>'name_en', p_data->>'description_de', p_data->>'description_en', coalesce(p_data->>'type', 'shop_item'), p_data->>'category',
            coalesce(p_data->>'unit', 'piece'), (p_data->>'net_price_cents')::integer, (p_data->>'purchase_price_cents')::integer, (p_data->>'margin')::numeric,
            coalesce((p_data->>'vat_rate')::numeric, 7), p_data->>'supplier', p_data->>'supplier_sku', p_data->>'supplier_url', (p_data->>'stock_total')::integer,
            coalesce((p_data->>'track_stock')::boolean, false), (p_data->>'available_until')::timestamptz, coalesce((p_data->>'shop_visible')::boolean, false),
            (p_data->>'shop_sort')::integer, coalesce((p_data->>'late_orderable')::boolean, false), p_data->>'shop_hint_de', p_data->>'shop_hint_en',
            p_data->>'purchase_note_de', p_data->>'purchase_note_en', p_data->'merch_config', coalesce(p_data->'images', '[]'::jsonb),
            coalesce((p_data->>'source_hubspot')::boolean, false), coalesce((p_data->>'source_shop')::boolean, false), p_data->>'internal_comment',
            coalesce((p_data->>'active')::boolean, true), (p_data->>'edition_id')::uuid,
            nullif(p_data->>'pass_type', ''), nullif(p_data->>'grants_role', ''), nullif(btrim(p_data->>'format_key'), ''),
            nullif(btrim(p_data->>'sponsoring_level_key'), ''), nullif(btrim(p_data->>'stand_days'), '')::smallint);
  else
    update product set
      name_de = case when p_data ? 'name_de' then p_data->>'name_de' else name_de end,
      name_en = case when p_data ? 'name_en' then nullif(p_data->>'name_en', '') else name_en end,
      description_de = case when p_data ? 'description_de' then nullif(p_data->>'description_de', '') else description_de end,
      description_en = case when p_data ? 'description_en' then nullif(p_data->>'description_en', '') else description_en end,
      type = case when p_data ? 'type' then p_data->>'type' else type end,
      category = case when p_data ? 'category' then p_data->>'category' else category end,
      unit = case when p_data ? 'unit' then p_data->>'unit' else unit end,
      net_price_cents = case when p_data ? 'net_price_cents' then (p_data->>'net_price_cents')::integer else net_price_cents end,
      purchase_price_cents = case when p_data ? 'purchase_price_cents' then (p_data->>'purchase_price_cents')::integer else purchase_price_cents end,
      margin = case when p_data ? 'margin' then (p_data->>'margin')::numeric else margin end,
      vat_rate = case when p_data ? 'vat_rate' then (p_data->>'vat_rate')::numeric else vat_rate end,
      supplier = case when p_data ? 'supplier' then nullif(p_data->>'supplier', '') else supplier end,
      supplier_sku = case when p_data ? 'supplier_sku' then nullif(p_data->>'supplier_sku', '') else supplier_sku end,
      supplier_url = case when p_data ? 'supplier_url' then nullif(p_data->>'supplier_url', '') else supplier_url end,
      stock_total = case when p_data ? 'stock_total' then (p_data->>'stock_total')::integer else stock_total end,
      track_stock = case when p_data ? 'track_stock' then (p_data->>'track_stock')::boolean else track_stock end,
      available_until = case when p_data ? 'available_until' then (p_data->>'available_until')::timestamptz else available_until end,
      shop_visible = case when p_data ? 'shop_visible' then (p_data->>'shop_visible')::boolean else shop_visible end,
      shop_sort = case when p_data ? 'shop_sort' then (p_data->>'shop_sort')::integer else shop_sort end,
      late_orderable = case when p_data ? 'late_orderable' then (p_data->>'late_orderable')::boolean else late_orderable end,
      shop_hint_de = case when p_data ? 'shop_hint_de' then nullif(p_data->>'shop_hint_de', '') else shop_hint_de end,
      shop_hint_en = case when p_data ? 'shop_hint_en' then nullif(p_data->>'shop_hint_en', '') else shop_hint_en end,
      purchase_note_de = case when p_data ? 'purchase_note_de' then nullif(p_data->>'purchase_note_de', '') else purchase_note_de end,
      purchase_note_en = case when p_data ? 'purchase_note_en' then nullif(p_data->>'purchase_note_en', '') else purchase_note_en end,
      merch_config = case when p_data ? 'merch_config' then p_data->'merch_config' else merch_config end,
      images = case when p_data ? 'images' then p_data->'images' else images end,
      internal_comment = case when p_data ? 'internal_comment' then nullif(p_data->>'internal_comment', '') else internal_comment end,
      active = case when p_data ? 'active' then (p_data->>'active')::boolean else active end,
      pass_type = case when p_data ? 'pass_type' then nullif(p_data->>'pass_type', '') else pass_type end,
      grants_role = case when p_data ? 'grants_role' then nullif(p_data->>'grants_role', '') else grants_role end,
      format_key = case when p_data ? 'format_key' then nullif(btrim(p_data->>'format_key'), '') else format_key end,
      sponsoring_level_key = case when p_data ? 'sponsoring_level_key' then nullif(btrim(p_data->>'sponsoring_level_key'), '') else sponsoring_level_key end,
      stand_days = case when p_data ? 'stand_days' then nullif(btrim(p_data->>'stand_days'), '')::smallint else stand_days end
    where sku = v_sku;
  end if;
  perform log_audit('product.upsert', 'product', v_sku, null, p_data - 'description_de' - 'description_en');
  return v_sku;
end $$;

-- =============================================================================
-- ADM-024 · Award
-- =============================================================================

-- Themenfelder wie im Airtable-Formular. Dort stehen „Science (Bio, Physik,
-- Chemie etc.)" und „Science" nebeneinander — hier ein Begriff.
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active) values
  ('award_topic', 'business',         'Business',                          'Business',                          10, true),
  ('award_topic', 'entrepreneurship', 'Entrepreneurship',                  'Entrepreneurship',                  20, true),
  ('award_topic', 'finance',          'Finance',                           'Finance',                           30, true),
  ('award_topic', 'consulting',       'Consulting',                        'Consulting',                        40, true),
  ('award_topic', 'marketing',        'Marketing',                         'Marketing',                         50, true),
  ('award_topic', 'sustainability',   'Sustainability',                    'Sustainability',                    60, true),
  ('award_topic', 'diversity',        'Women, Diversity & Empowerment',    'Women, Diversity & Empowerment',    70, true),
  ('award_topic', 'science',          'Science (Bio, Physik, Chemie …)',   'Science (biology, physics, chemistry …)', 80, true),
  ('award_topic', 'tech_ai',          'Tech & AI',                         'Tech & AI',                         90, true),
  ('award_topic', 'informatik',       'Informatik',                        'Computer science',                 100, true),
  ('award_topic', 'engineering',      'Engineering',                       'Engineering',                      110, true),
  ('award_topic', 'other',            'Anderes',                           'Other',                            120, true)
on conflict (vocabulary, key) do nothing;

create table award_secret (
  edition_id uuid primary key references event (id) on delete cascade,
  salt       bytea not null default extensions.gen_random_bytes(32),
  created_at timestamptz not null default now()
);
alter table award_secret enable row level security;
revoke all on award_secret from anon, authenticated, service_role;
comment on table award_secret is 'ADM-024: Salz für award_vote.voter_hash je Edition. Nur für die Award-Funktionen; nie auslesen.';

create table award_application (
  id                 uuid primary key default gen_random_uuid(),
  edition_id         uuid not null references event (id) on delete cascade,
  organization_id    uuid references organization (id) on delete set null,
  name               text not null check (char_length(btrim(name)) between 1 and 120),
  topics             text[] not null default '{}',
  location           text not null check (char_length(location) <= 120),
  description        text not null check (char_length(description) <= 2500),
  mission            text not null check (char_length(mission) <= 4000),
  project            text not null check (char_length(project) <= 4000),
  contact_first_name text not null check (char_length(contact_first_name) <= 80),
  contact_last_name  text not null check (char_length(contact_last_name) <= 80),
  contact_email      citext not null check (char_length(contact_email) <= 254),
  founded_year       smallint check (founded_year is null or founded_year between 1800 and 2100),
  active_members     integer check (active_members is null or active_members between 0 and 1000000),
  website            text check (website is null or char_length(website) <= 300),
  university         text check (university is null or char_length(university) <= 160),
  notes              text check (notes is null or char_length(notes) <= 2000),
  images             text[] not null default '{}' check (cardinality(images) <= 3),
  privacy_consent_at timestamptz not null,
  status             text not null default 'submitted'
                     check (status in ('submitted', 'accepted', 'rejected', 'finalist', 'winner')),
  source             text not null default 'public' check (source in ('public', 'admin')),
  submitter_hash     text,
  decided_by         uuid references person (id) on delete set null,
  decided_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index award_application_edition_idx on award_application (edition_id, status);
create index award_application_submitter_idx on award_application (submitter_hash, created_at);
create trigger trg_award_application_updated before update on award_application
  for each row execute function set_updated_at();
alter table award_application enable row level security;
revoke all on award_application from anon, authenticated;
grant all on award_application to service_role;
comment on table award_application is
  'ADM-024: Bewerbung zum Initiativen-Award (Felder nach dem Airtable-Formular). Ansprechperson nur hier, nie öffentlich. Bilder im privaten Bucket award-images.';
comment on column award_application.submitter_hash is 'ADM-024: Hash wie award_vote.voter_hash — nur für die Ratenbegrenzung, keine Adresse.';

create table award_vote (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references award_application (id) on delete cascade,
  edition_id     uuid not null references event (id) on delete cascade,
  voter_hash     text not null,
  created_at     timestamptz not null default now(),
  unique (application_id, voter_hash)
);
create index award_vote_hash_idx on award_vote (voter_hash, created_at);
alter table award_vote enable row level security;
revoke all on award_vote from anon, authenticated;
grant all on award_vote to service_role;
comment on table award_vote is
  'ADM-024: öffentliche Stimme ohne Personendaten — voter_hash = sha256(IP, Edition, Salz), gebildet in award_hash(); die Adresse wird nicht gespeichert.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('award-images', 'award-images', false, 2097152, array['image/webp'])
on conflict (id) do nothing;

-- Fristen der aktuellen Edition mit Platzhalter -------------------------------------
insert into deadline (edition_id, key, audience, due_at, label_de, label_en, description_de, description_en, reminder_lead_hours)
select e.id, v.key, 'award', v.due_at, v.label_de, v.label_en,
       'Platzhalter — Konrad legt den Termin fest.', 'Placeholder — date to be set by Konrad.', 0
  from (select id from event where is_edition order by start_date desc limit 1) e
 cross join (values
   ('award_apply_until', timestamptz '2027-02-28 23:59 Europe/Berlin', 'Award: Bewerbung bis',  'Award: applications until'),
   ('award_vote_from',   timestamptz '2027-03-01 00:00 Europe/Berlin', 'Award: Abstimmung ab',  'Award: voting from'),
   ('award_vote_until',  timestamptz '2027-03-31 23:59 Europe/Berlin', 'Award: Abstimmung bis', 'Award: voting until')
 ) as v(key, due_at, label_de, label_en)
on conflict (edition_id, key) do nothing;

-- Intern: aktuelle Edition, Hash, Fenster ------------------------------------------
create or replace function award_current_edition()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select e.id from event e where e.is_edition order by e.start_date desc limit 1
$$;
revoke execute on function award_current_edition() from public, anon, authenticated;

create or replace function award_hash(p_edition_id uuid, p_ip_hash text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_salt bytea;
begin
  -- `p_ip_hash` ist schon sha256(ip) aus der Route; hier kommen Edition und Salz dazu.
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  insert into award_secret (edition_id) values (p_edition_id) on conflict (edition_id) do nothing;
  select s.salt into v_salt from award_secret s where s.edition_id = p_edition_id;
  return encode(extensions.digest(convert_to(p_ip_hash || '|' || p_edition_id::text, 'UTF8') || v_salt, 'sha256'), 'hex');
end $$;
revoke execute on function award_hash(uuid, text) from public, anon, authenticated;

create or replace function award_windows(p_edition_id uuid)
 RETURNS TABLE(apply_until timestamp with time zone, vote_from timestamp with time zone, vote_until timestamp with time zone,
               apply_open boolean, vote_open boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $$
  with d as (
    select (select due_at from deadline where edition_id = p_edition_id and key = 'award_apply_until') as au,
           (select due_at from deadline where edition_id = p_edition_id and key = 'award_vote_from')   as vf,
           (select due_at from deadline where edition_id = p_edition_id and key = 'award_vote_until')  as vu
  )
  -- Ohne Frist ist zu: eine fehlende Zeile darf keine offene Abstimmung bedeuten.
  select au, vf, vu, coalesce(now() <= au, false), coalesce(now() >= vf and now() <= vu, false) from d
$$;
revoke execute on function award_windows(uuid) from public, anon, authenticated;

-- Server-Funktionen für die öffentlichen Routen -----------------------------------
create or replace function award_apply(p_data jsonb, p_ip_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_ed uuid := award_current_edition(); v_hash text; v_id uuid; v_topics text[]; v_t text; v_feld text;
  v_email text := lower(btrim(coalesce(p_data->>'contact_email', '')));
  v_jahr text := nullif(btrim(coalesce(p_data->>'founded_year', '')), '');
  v_mitglieder text := nullif(btrim(coalesce(p_data->>'active_members', '')), '');
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Erwartete Zustände als Rückgabe, nicht als raise (Kopf: kein Statement im Fehlerprotokoll).
  if v_ed is null or not coalesce((select w.apply_open from award_windows(v_ed) w), false) then
    return jsonb_build_object('status', 'closed');
  end if;
  v_hash := award_hash(v_ed, p_ip_hash);
  if v_hash is null then return jsonb_build_object('status', 'invalid', 'field', 'source'); end if;

  foreach v_feld in array array['name', 'location', 'description', 'mission', 'project', 'contact_first_name', 'contact_last_name', 'contact_email'] loop
    if nullif(btrim(coalesce(p_data->>v_feld, '')), '') is null then
      return jsonb_build_object('status', 'invalid', 'field', v_feld);
    end if;
  end loop;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('status', 'invalid', 'field', 'contact_email');
  end if;
  if coalesce(p_data->>'privacy_consent', '') <> 'true' then
    return jsonb_build_object('status', 'invalid', 'field', 'privacy_consent');
  end if;
  if (v_jahr is not null and v_jahr !~ '^[0-9]{4}$') then return jsonb_build_object('status', 'invalid', 'field', 'founded_year'); end if;
  if (v_mitglieder is not null and v_mitglieder !~ '^[0-9]{1,7}$') then return jsonb_build_object('status', 'invalid', 'field', 'active_members'); end if;
  if jsonb_typeof(coalesce(p_data->'topics', '[]')) <> 'array' then return jsonb_build_object('status', 'invalid', 'field', 'topics'); end if;
  select coalesce(array_agg(distinct x), '{}') into v_topics from jsonb_array_elements_text(coalesce(p_data->'topics', '[]')) x;
  if cardinality(v_topics) = 0 then return jsonb_build_object('status', 'invalid', 'field', 'topics'); end if;
  foreach v_t in array v_topics loop
    if not exists (select 1 from vocab_term v where v.vocabulary = 'award_topic' and v.active and v.key = v_t) then
      return jsonb_build_object('status', 'invalid', 'field', 'topics');
    end if;
  end loop;

  if (select count(*) from award_application a where a.submitter_hash = v_hash and a.created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  begin
    insert into award_application (edition_id, name, topics, location, description, mission, project,
                                   contact_first_name, contact_last_name, contact_email, founded_year, active_members,
                                   website, university, notes, privacy_consent_at, source, submitter_hash)
    values (v_ed, btrim(p_data->>'name'), v_topics, btrim(p_data->>'location'), btrim(p_data->>'description'),
            btrim(p_data->>'mission'), btrim(p_data->>'project'), btrim(p_data->>'contact_first_name'),
            btrim(p_data->>'contact_last_name'), v_email, v_jahr::smallint, v_mitglieder::integer,
            nullif(btrim(coalesce(p_data->>'website', '')), ''),
            nullif(btrim(coalesce(p_data->>'university', '')), ''), nullif(btrim(coalesce(p_data->>'notes', '')), ''),
            now(), 'public', v_hash)
    returning id into v_id;
  exception when check_violation then
    return jsonb_build_object('status', 'invalid', 'field', 'length');
  end;
  perform log_audit('award.apply', 'award_application', v_id::text, null, jsonb_build_object('edition_id', v_ed));
  return jsonb_build_object('status', 'ok', 'id', v_id, 'edition_id', v_ed);
end $$;
revoke execute on function award_apply(jsonb, text) from public, anon, authenticated;
grant execute on function award_apply(jsonb, text) to service_role;

-- Bilder nachreichen: nur dieselbe Quelle, nur in der ersten Stunde, nur einmal,
-- nur Pfade unter der eigenen Bewerbung.
create or replace function award_set_images(p_application_id uuid, p_paths text[], p_ip_hash text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a award_application; v_p text;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_a from award_application where id = p_application_id for update;
  if not found then return 'not_found'; end if;
  if v_a.submitter_hash is distinct from award_hash(v_a.edition_id, p_ip_hash)
     or v_a.created_at < now() - interval '1 hour' or cardinality(v_a.images) > 0 then
    return 'invalid';
  end if;
  if cardinality(coalesce(p_paths, '{}')) > 3 then return 'invalid'; end if;
  foreach v_p in array coalesce(p_paths, '{}') loop
    if v_p !~ ('^' || v_a.edition_id::text || '/' || v_a.id::text || '/[0-9]\.webp$') then return 'invalid'; end if;
  end loop;
  update award_application set images = coalesce(p_paths, '{}') where id = p_application_id;
  return 'ok';
end $$;
revoke execute on function award_set_images(uuid, text[], text) from public, anon, authenticated;
grant execute on function award_set_images(uuid, text[], text) to service_role;

create or replace function award_vote_cast(p_application_id uuid, p_ip_hash text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a award_application; v_hash text; v_n integer;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_a from award_application where id = p_application_id;
  if not found then return 'not_found'; end if;
  if v_a.status not in ('accepted', 'finalist') then return 'not_votable'; end if;
  if not coalesce((select w.vote_open from award_windows(v_a.edition_id) w), false) then return 'closed'; end if;
  v_hash := award_hash(v_a.edition_id, p_ip_hash);
  if v_hash is null then return 'invalid'; end if;
  if (select count(*) from award_vote v where v.voter_hash = v_hash and v.created_at > now() - interval '1 hour') >= 30 then
    return 'rate_limited';
  end if;
  insert into award_vote (application_id, edition_id, voter_hash) values (v_a.id, v_a.edition_id, v_hash)
  on conflict (application_id, voter_hash) do nothing;
  get diagnostics v_n = row_count;
  return case when v_n = 1 then 'ok' else 'duplicate' end;
end $$;
revoke execute on function award_vote_cast(uuid, text) from public, anon, authenticated;
grant execute on function award_vote_cast(uuid, text) to service_role;

-- Öffentliche Ansicht: nur angenommene Bewerbungen, nur inhaltliche Felder, keine
-- Zählerstände; dazu die Fenster. `p_ip_hash` sagt, wofür diese Quelle schon gestimmt hat.
create or replace function award_public_entries(p_ip_hash text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, topics text[], location text, description text, mission text, project text,
               website text, university text, founded_year smallint, active_members integer, images text[], status text,
               voted boolean, apply_until timestamp with time zone, vote_from timestamp with time zone,
               vote_until timestamp with time zone, apply_open boolean, vote_open boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid := award_current_edition(); v_hash text; w record;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_ed is null then return; end if;
  select * into w from award_windows(v_ed);
  v_hash := award_hash(v_ed, p_ip_hash);
  -- Keine Bewerbung sichtbar? Trotzdem eine Zeile mit den Fenstern — die Seite
  -- braucht sie für „Bewerbung offen bis …".
  if not exists (select 1 from award_application a where a.edition_id = v_ed and a.status in ('accepted', 'finalist', 'winner')) then
    return query select null::uuid, null::text, null::text[], null::text, null::text, null::text, null::text, null::text, null::text,
                        null::smallint, null::integer, null::text[], null::text, false,
                        w.apply_until, w.vote_from, w.vote_until, w.apply_open, w.vote_open;
    return;
  end if;
  return query
    select a.id, a.name, a.topics, a.location, a.description, a.mission, a.project, a.website, a.university,
           a.founded_year, a.active_members, a.images, a.status,
           v_hash is not null and exists (select 1 from award_vote v where v.application_id = a.id and v.voter_hash = v_hash),
           w.apply_until, w.vote_from, w.vote_until, w.apply_open, w.vote_open
      from award_application a
     where a.edition_id = v_ed and a.status in ('accepted', 'finalist', 'winner')
     order by a.status = 'winner' desc, a.status = 'finalist' desc, a.name;
end $$;
revoke execute on function award_public_entries(text) from public, anon, authenticated;
grant execute on function award_public_entries(text) to service_role;

-- Admin ---------------------------------------------------------------------------
create or replace function award_applications_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, topics text[], location text, description text, mission text, project text,
               contact_first_name text, contact_last_name text, contact_email text, founded_year smallint,
               active_members integer, website text, university text, notes text, images text[], status text,
               source text, organization_id uuid, organization_name text, votes bigint, created_at timestamp with time zone,
               decided_at timestamp with time zone, decided_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid := coalesce(p_edition_id, award_current_edition());
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('initiatives') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select a.id, a.name, a.topics, a.location, a.description, a.mission, a.project,
           a.contact_first_name, a.contact_last_name, a.contact_email::text, a.founded_year, a.active_members,
           a.website, a.university, a.notes, a.images, a.status, a.source, a.organization_id,
           coalesce(nullif(btrim(o.communication_name), ''), o.legal_name),
           (select count(*) from award_vote v where v.application_id = a.id),
           a.created_at, a.decided_at,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
      from award_application a
      left join organization o on o.id = a.organization_id
      left join person p on p.id = a.decided_by
     where a.edition_id = v_ed
     order by (select count(*) from award_vote v where v.application_id = a.id) desc, a.created_at;
end $$;

create or replace function set_award_status(p_application_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alt text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('initiatives') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('submitted', 'accepted', 'rejected', 'finalist', 'winner') then
    raise exception 'invalid_state' using errcode = '22023', detail = coalesce(p_status, 'null');
  end if;
  select a.status into v_alt from award_application a where a.id = p_application_id for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  update award_application set status = p_status, decided_by = current_person_id(), decided_at = now()
   where id = p_application_id;
  perform log_audit('award.status', 'award_application', p_application_id::text,
                    jsonb_build_object('status', v_alt), jsonb_build_object('status', p_status));
end $$;

-- Initiativen, die auch Partner sind: Bewerbung mit der Organisation verknüpfen.
create or replace function set_award_organization(p_application_id uuid, p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alt uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('initiatives') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_org_id is not null and not exists (select 1 from organization o where o.id = p_org_id) then
    raise exception 'org_not_found' using errcode = 'P0002';
  end if;
  select a.organization_id into v_alt from award_application a where a.id = p_application_id for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  update award_application set organization_id = p_org_id where id = p_application_id;
  perform log_audit('award.organization', 'award_application', p_application_id::text,
                    jsonb_build_object('organization_id', v_alt), jsonb_build_object('organization_id', p_org_id));
end $$;

-- Löschen (Spam, Rückzug): Bilder in die Aufräum-Warteschlange, Stimmen fallen mit.
create or replace function delete_award_application(p_application_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a award_application;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('initiatives') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_a from award_application where id = p_application_id for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0002'; end if;
  insert into storage_purge_queue (bucket, path)
    select 'award-images', unnest(v_a.images)
  on conflict (bucket, path) do nothing;
  delete from award_application where id = p_application_id;
  perform log_audit('award.delete', 'award_application', p_application_id::text,
                    jsonb_build_object('name', v_a.name, 'status', v_a.status), null);
end $$;

select harden_definer_functions();
