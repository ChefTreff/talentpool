-- =============================================================================
-- 0001 · Core-Schema — Identitäts-Kern, Aktivität, Vokabular, n:m, Indizes, Views
-- Konvention: snake_case · uuid-PK (gen_random_uuid) · created_at/updated_at
--             FKs kaskadieren nur VON person auf Profil-Kinder (nie umgekehrt).
-- Sicherheit (RLS/GRANTs) folgt in 0003. Extensions liegen im Schema `extensions`.
-- =============================================================================
set search_path = public, extensions;

-- === Extensions =============================================================
create extension if not exists citext   with schema extensions;  -- case-insensitive E-Mail
create extension if not exists pg_trgm  with schema extensions;  -- Fuzzy-Name-Matching (Dedup)
create extension if not exists unaccent with schema extensions;  -- Müller/Mueller (Dedup)
-- gen_random_uuid() ist ab PG13 im Core (kein pgcrypto nötig).

-- === Gemeinsamer updated_at-Trigger ========================================
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- === Vokabular (zentrales Lookup, hierarchiefähig) =========================
create table vocab_term (
  vocabulary        text        not null,
  key               text        not null,
  label_de          text        not null,
  label_en          text        not null,
  sort_order        integer     not null default 0,
  active            boolean     not null default true,
  parent_vocabulary text,                              -- z. B. study_program -> study_field
  parent_key        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (vocabulary, key),
  constraint vocab_term_parent_fk
    foreign key (parent_vocabulary, parent_key)
    references vocab_term (vocabulary, key) on delete restrict,
  constraint vocab_term_parent_both_or_neither
    check ((parent_vocabulary is null) = (parent_key is null))
);
create index vocab_term_parent_idx on vocab_term (parent_vocabulary, parent_key);
create trigger trg_vocab_term_updated before update on vocab_term
  for each row execute function set_updated_at();

-- === person (eine natürliche Person = ein Datensatz) =======================
create table person (
  id                    uuid        primary key default gen_random_uuid(),
  auth_user_id          uuid        unique references auth.users (id) on delete set null,
  first_name            text,
  last_name             text,                          -- veränderlich (Heirat) — kein Schlüssel
  birthdate             date,
  -- Profil (Werte = vocab-Keys; Skalar-Integrität App-seitig, Kommentar je Feld):
  occupation_status     text,                          -- vocab occupation_status
  work_experience       text,                          -- vocab work_experience
  career_level          text,                          -- vocab career_level
  employer_type         text,                          -- vocab employer_type
  employer_name         text,
  study_field           text,                          -- vocab study_field
  study_program         text,                          -- vocab study_program (parent = study_field)
  university            text,
  self_assessment       text,                          -- vocab self_assessment
  linkedin_url          text,                          -- starkes Match-Signal (Dedup)
  linkedin_normalized   text,                          -- normalisiert beim Import; Junk -> NULL
  phone                 text,
  phone_e164            text,                          -- normalisiert beim Import (Signal)
  cv_url                text,                          -- Supabase Storage
  gender                text,                          -- vocab gender
  nationality           text,
  country               text,                          -- Wohnsitz (ISO-3166 alpha-2), für Segmentierung
  preferred_language    text        not null default 'de',  -- de/en
  startup_phase         text,                          -- vocab startup_phase (nur Founder)
  invite_code           text,                          -- Referral (roh übernommen, keine Logik)
  is_ambassador         boolean     not null default false,
  referred_by_person_id uuid        references person (id) on delete set null,
  engagement_score      numeric,                       -- berechnet (später), keine Logik jetzt
  source_first          text,                          -- erster Kontaktkanal
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index person_referred_by_idx      on person (referred_by_person_id);
create index person_linkedin_norm_idx    on person (linkedin_normalized);
create index person_phone_e164_idx       on person (phone_e164);
create trigger trg_person_updated before update on person
  for each row execute function set_updated_at();

-- === person_email (1:n; genau eine primär -> Invariante in 0002) ===========
create table person_email (
  id         uuid        primary key default gen_random_uuid(),
  person_id  uuid        not null references person (id) on delete cascade,
  email      citext      not null unique,
  type       text        not null default 'private' check (type in ('private','business')),
  is_primary boolean     not null default false,
  verified   boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index person_email_person_idx on person_email (person_id);
create trigger trg_person_email_updated before update on person_email
  for each row execute function set_updated_at();

-- === organization (angelegt; Ausbau im Partner-Portal) =====================
create table organization (
  id                 uuid        primary key default gen_random_uuid(),
  legal_name         text,
  communication_name text,
  logo_dark          text,
  logo_light         text,                             -- nur SVG/EPS
  description        text,
  address_street     text,
  address_zip        text,
  address_city       text,
  address_country    text,
  hubspot_id         text,
  partner_category   text,                             -- vocab partner_category
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger trg_organization_updated before update on organization
  for each row execute function set_updated_at();

-- === org_membership (Person <-> Organisation mit Rollen) ===================
create table org_membership (
  id         uuid        primary key default gen_random_uuid(),
  person_id  uuid        not null references person (id) on delete cascade,
  org_id     uuid        not null references organization (id) on delete cascade,
  roles      text[]      not null default '{}',        -- Werte aus vocab contact_role
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, org_id)
);
create index org_membership_org_idx    on org_membership (org_id);
create index org_membership_person_idx on org_membership (person_id);
create trigger trg_org_membership_updated before update on org_membership
  for each row execute function set_updated_at();

-- === event (Format/Termin) =================================================
create table event (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  format_tag      text        not null,                -- vocab format_tag
  start_date      date,
  end_date        date,
  parent_event_id uuid        references event (id) on delete set null,
  location        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index event_parent_idx on event (parent_event_id);
create trigger trg_event_updated before update on event
  for each row execute function set_updated_at();

-- === registration (Person <-> Event: die ChefTreff-Historie) ===============
create table registration (
  id              uuid        primary key default gen_random_uuid(),
  person_id       uuid        not null references person (id) on delete cascade,
  event_id        uuid        not null references event (id) on delete restrict,
  status          text        not null,                -- vocab registration_status
  ticket_type     text,                                -- vocab ticket_type
  source          text,                                -- typeform/vivenu/crew_pass/activecampaign/portal
  external_source text,
  external_ref    text,                                -- Barcode / Vivenu-Txn-ID / Luma-Guest-ID
  external_ids    jsonb,
  registered_at   timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Idempotenter Re-Import (NULLs sind distinct -> greift nur bei gesetzter Ref):
  constraint registration_external_uniq        unique (external_source, external_ref),
  constraint registration_person_event_tt_uniq unique (person_id, event_id, ticket_type)
);
create index registration_person_idx on registration (person_id);
create index registration_event_idx  on registration (event_id);
create trigger trg_registration_updated before update on registration
  for each row execute function set_updated_at();

-- === person_interest (n:m; Composite-FK auf vocab; kein is_founder_topic) ==
create table person_interest (
  person_id  uuid        not null references person (id) on delete cascade,
  vocabulary text        not null,
  term_key   text        not null,
  created_at timestamptz not null default now(),
  primary key (person_id, vocabulary, term_key),
  constraint person_interest_vocab_chk
    check (vocabulary in ('interests','interests_founder')),
  constraint person_interest_term_fk
    foreign key (vocabulary, term_key) references vocab_term (vocabulary, key) on delete restrict
);
-- Reverse-Index für "wer interessiert sich für X" (Staff-Queries):
create index person_interest_term_idx on person_interest (vocabulary, term_key);

-- === person_acquisition_channel (n:m; "Wie aufmerksam geworden") ===========
create table person_acquisition_channel (
  person_id  uuid        not null references person (id) on delete cascade,
  vocabulary text        not null default 'acquisition_channel'
                         check (vocabulary = 'acquisition_channel'),
  term_key   text        not null,
  created_at timestamptz not null default now(),
  primary key (person_id, term_key),
  constraint pac_term_fk
    foreign key (vocabulary, term_key) references vocab_term (vocabulary, key) on delete restrict
);
create index pac_term_idx on person_acquisition_channel (term_key);

-- === staff_user (internes Team; nur service_role schreibt -> Policies 0003) =
create table staff_user (
  auth_user_id uuid        primary key references auth.users (id) on delete cascade,
  email        citext,
  display_name text,
  created_at   timestamptz not null default now()
);

-- === eligibility (View statt gespeicherter generated column) ===============
-- u35 = jünger als 35 zum Referenzdatum (default heute). Später pro Event/Saison.
create or replace function is_u35(p_birthdate date, p_ref date default current_date)
returns boolean language sql stable as $$
  select case when p_birthdate is null then null
              else extract(year from age(p_ref, p_birthdate)) < 35 end
$$;

create view person_eligibility as
  select id as person_id, is_u35(birthdate) as eligibility_u35
  from person;

-- === lifecycle (View pro person × format_tag, abgeleitet aus registration) =
-- Regeln wachsen später (applicant braucht Application-Konzept, interested
-- braucht das ActiveCampaign-Signal) — bewusst aus dem gebaut, was heute da ist.
create view person_lifecycle as
  select
    r.person_id,
    e.format_tag,
    case
      when r.status = 'attended' then 'alumni'
      when r.status = 'confirmed' and e.end_date is not null and e.end_date < current_date then 'alumni'
      when r.status = 'confirmed' then 'participant'
      when r.status in ('applied','waitlisted') then 'applicant'
      else 'lead'
    end as lifecycle_status
  from registration r
  join event e on e.id = r.event_id;

-- Rollup: höchste erreichte Stufe je Person (für Listen-Filter im Admin).
create view person_lifecycle_current as
  select distinct on (person_id) person_id, lifecycle_status
  from (
    select
      person_id,
      lifecycle_status,
      case lifecycle_status
        when 'alumni' then 5 when 'participant' then 4 when 'applicant' then 3
        when 'interested' then 2 else 1 end as rnk
    from person_lifecycle
  ) s
  order by person_id, rnk desc;
