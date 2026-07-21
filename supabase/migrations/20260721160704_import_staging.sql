-- =============================================================================
-- 0004 · Import-Staging + Dedup + Fuzzy-Index
--   import.*    : Roh-Landing (jsonb) + Normalisierungs-Spalten + durable Map
--   public.*    : potential_duplicate (echte Queue-Quelle) + person_merge_log
--   Fuzzy-Index : immutable_unaccent-Wrapper + Trigram-GIN auf person(name)
-- Nur service_role (Migration/Staff) greift hierauf zu.
-- =============================================================================
set search_path = public, extensions;

-- === Import-Schema (nicht im Data-API exponiert) ===========================
create schema if not exists import;

-- Roh-Landing + Normalisierung in einer Tabelle (source-diskriminiert).
-- raw jsonb bewahrt die Originalzeile 1:1 (nie zerstören).
create table import.staging_contact (
  id                    bigint generated always as identity primary key,
  source                text        not null,   -- airtable_unified / airtable_ticketholder / activecampaign / ...
  source_row_id         text,                   -- Original-ID (Airtable recId / AC id)
  raw                   jsonb       not null,
  -- Normalisierte Schwesterspalten (Schritt 2 der Pipeline):
  email                 citext,
  email_valid           boolean,
  first_name            text,
  last_name             text,
  linkedin_normalized   text,
  phone_e164            text,
  country               text,
  opt_in_newsletter     boolean,                -- aus ActiveCampaign roh mitsichern (Consent P5)
  is_junk               boolean     not null default false,
  junk_reason           text,
  -- Auflösung:
  person_id             uuid        references person (id) on delete set null,
  ingested_at           timestamptz not null default now(),
  processed_at          timestamptz,
  unique (source, source_row_id)
);
create index staging_email_idx        on import.staging_contact (email);
create index staging_linkedin_idx     on import.staging_contact (linkedin_normalized);
create index staging_phone_idx        on import.staging_contact (phone_e164);
create index staging_person_idx       on import.staging_contact (person_id);

-- Durable Map source_row_id -> person.id (überlebt Neu-Laden des Stagings -> idempotent).
create table import.source_person_map (
  source        text not null,
  source_row_id text not null,
  person_id     uuid not null references person (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (source, source_row_id)
);
create index source_person_map_person_idx on import.source_person_map (person_id);

-- === Dedup: Review-Queue (public, echte Tabelle) ===========================
create table potential_duplicate (
  id           uuid        primary key default gen_random_uuid(),
  person_id_a  uuid        not null references person (id) on delete cascade,
  person_id_b  uuid        not null references person (id) on delete cascade,
  score        numeric     not null,
  signals      jsonb       not null default '{}',   -- welche Signale trafen: email/linkedin/name+dob/phone
  status       text        not null default 'open'
                           check (status in ('open','confirmed_dupe','not_dupe')),
  reviewed_by  uuid        references auth.users (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint pd_canonical_order check (person_id_a < person_id_b),
  unique (person_id_a, person_id_b)
);
create index potential_duplicate_status_idx on potential_duplicate (status);
create index potential_duplicate_b_idx      on potential_duplicate (person_id_b);
create trigger trg_potential_duplicate_updated before update on potential_duplicate
  for each row execute function set_updated_at();

-- === Dedup: Merge-Audit (append-only) ======================================
create table person_merge_log (
  id                  uuid        primary key default gen_random_uuid(),
  surviving_person_id uuid        not null references person (id) on delete cascade,
  merged_person_id    uuid        not null,   -- kein FK: Zeile ist nach Merge weg
  merged_at           timestamptz not null default now(),
  actor               text,                   -- 'migration' / auth-uid / staff
  payload             jsonb                   -- Snapshot + Feld-Survivorship
);
create index person_merge_log_surviving_idx on person_merge_log (surviving_person_id);

-- === Fuzzy-Matching-Index (Identity-Resolution) ============================
-- unaccent() ist STABLE und daher nicht direkt indizierbar -> immutable Wrapper
-- mit fixierter Dictionary (Standard-Pattern).
create or replace function immutable_unaccent(text) returns text
  language sql immutable strict parallel safe
  as $$ select extensions.unaccent('extensions.unaccent', $1) $$;

create index person_name_trgm_idx on person using gin (
  immutable_unaccent(lower(coalesce(first_name,'') || ' ' || coalesce(last_name,'')))
  extensions.gin_trgm_ops
);

-- === Sicherheit: alles service_role-only ===================================
grant usage on schema import to service_role;
grant all on all tables in schema import to service_role;
alter default privileges in schema import grant all on tables to service_role;

alter table import.staging_contact    enable row level security;
alter table import.source_person_map  enable row level security;
alter table potential_duplicate        enable row level security;
alter table person_merge_log           enable row level security;
-- keine Policies -> nur service_role (Bypass); public-Tabellen sind sonst dicht.

grant all on potential_duplicate to service_role;
grant all on person_merge_log   to service_role;
