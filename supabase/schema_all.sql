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
-- =============================================================================
-- 0002 · Primäre-E-Mail-Invariante — jede Person hat GENAU eine primäre E-Mail
--   (a) höchstens eine primäre: partieller Unique-Index
--   (b) mindestens eine primäre: DEFERRABLE Constraint-Trigger (Prüfung bei COMMIT)
-- "genau eine primär" impliziert "mindestens eine E-Mail".
-- =============================================================================
set search_path = public, extensions;

-- (a) höchstens eine primäre E-Mail je Person
create unique index person_email_single_primary
  on person_email (person_id) where is_primary;

-- (b) genau eine primäre E-Mail — deferred, damit `insert person; insert email;`
--     in einer Transaktion erlaubt ist (Check erst bei COMMIT).
create or replace function enforce_primary_email() returns trigger
language plpgsql as $$
declare
  pids uuid[];
  pid  uuid;
  n    int;
begin
  if tg_table_name = 'person' then
    pids := array[new.id];
  else
    -- person_email: bei Reparenting (Merge) OLD und NEW person prüfen
    pids := array(
      select distinct x from unnest(array[
        case when tg_op <> 'INSERT' then old.person_id end,
        case when tg_op <> 'DELETE' then new.person_id end
      ]) as x where x is not null
    );
  end if;

  foreach pid in array pids loop
    if exists (select 1 from person where id = pid) then  -- gelöschte Person überspringen
      select count(*) into n from person_email
        where person_id = pid and is_primary;
      if n <> 1 then
        raise exception 'person % muss genau eine primäre E-Mail haben (gefunden: %)', pid, n
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;
  return null;
end $$;

create constraint trigger trg_person_primary_email
  after insert on person
  deferrable initially deferred for each row
  execute function enforce_primary_email();

create constraint trigger trg_person_email_primary
  after insert or update or delete on person_email
  deferrable initially deferred for each row
  execute function enforce_primary_email();

-- Hinweis (Bulk-Import, P3): Trigger via `alter table ... disable trigger` aussetzen,
-- laden, dann prüfen:
--   select person_id from person_email group by person_id
--   having count(*) filter (where is_primary) <> 1;
-- Danach Trigger reaktivieren. Derselbe Query eignet sich als nächtlicher Integritäts-Check.
-- =============================================================================
-- 0003 · Sicherheit — Helper, RLS-Policies, Spalten-Grants, Onboarding-RPC
-- Modell: Teilnehmer über anon/authenticated-Key mit RLS (nur eigene Daten).
--         Staff + Migration serverseitig über service_role (RLS-Bypass).
-- =============================================================================
set search_path = public, extensions;

-- === Helper (SECURITY DEFINER, search_path gepinnt) ========================
create or replace function current_person_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from person where auth_user_id = auth.uid()
$$;

create or replace function is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_user where auth_user_id = auth.uid())
$$;

-- === Onboarding / Claim-RPC ================================================
-- (1) bereits verknüpft? -> zurück  (2) verifizierte E-Mail matcht migrierte
-- Person -> claimen  (3) sonst Person + primäre E-Mail in einer Transaktion.
-- Schritt (2) nur bei bestätigter E-Mail (email_confirmed_at) -> kein Takeover.
create or replace function claim_or_create_person() returns uuid
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid      uuid   := auth.uid();
  v_email    citext := auth.email();
  v_verified boolean;
  v_pid      uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- (1) bereits verknüpft
  select id into v_pid from person where auth_user_id = v_uid;
  if found then
    return v_pid;
  end if;

  select (email_confirmed_at is not null) into v_verified
    from auth.users where id = v_uid;

  -- (2) migrierte Person via verifizierte E-Mail claimen
  if v_email is not null and coalesce(v_verified, false) then
    select pe.person_id into v_pid
      from person_email pe
      join person p on p.id = pe.person_id
     where pe.email = v_email and p.auth_user_id is null
     limit 1;
    if found then
      update person set auth_user_id = v_uid where id = v_pid;
      update person_email set verified = true
        where person_id = v_pid and email = v_email;
      return v_pid;
    end if;
  end if;

  -- (3) neue Person + primäre E-Mail
  if v_email is null then
    raise exception 'authenticated user has no email' using errcode = '23502';
  end if;
  insert into person (auth_user_id, source_first) values (v_uid, 'portal')
    returning id into v_pid;
  insert into person_email (person_id, email, is_primary, verified)
    values (v_pid, v_email, true, coalesce(v_verified, false));
  return v_pid;
end $$;

-- Primäre E-Mail atomar umsetzen (hält die Invariante ein).
create or replace function set_primary_email(p_email_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare v_pid uuid := current_person_id();
begin
  if v_pid is null then
    raise exception 'no person for current user' using errcode = '28000';
  end if;
  if not exists (select 1 from person_email where id = p_email_id and person_id = v_pid) then
    raise exception 'email % not found for current person', p_email_id;
  end if;
  update person_email set is_primary = (id = p_email_id) where person_id = v_pid;
end $$;

-- === RLS aktivieren (default deny auf allen Tabellen) ======================
alter table person                     enable row level security;
alter table person_email               enable row level security;
alter table person_interest            enable row level security;
alter table person_acquisition_channel enable row level security;
alter table registration               enable row level security;
alter table event                      enable row level security;
alter table vocab_term                 enable row level security;
alter table organization               enable row level security;
alter table org_membership             enable row level security;
alter table staff_user                 enable row level security;

-- Teilnehmer-Policies (eigene Daten). Staff/Migration nutzen service_role (Bypass).
create policy person_self_sel on person for select to authenticated
  using (auth_user_id = auth.uid());
create policy person_self_upd on person for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy pe_self_sel on person_email for select to authenticated
  using (person_id = current_person_id());

create policy pi_self_sel on person_interest for select to authenticated
  using (person_id = current_person_id());
create policy pi_self_ins on person_interest for insert to authenticated
  with check (person_id = current_person_id());
create policy pi_self_del on person_interest for delete to authenticated
  using (person_id = current_person_id());

create policy pac_self_sel on person_acquisition_channel for select to authenticated
  using (person_id = current_person_id());
create policy pac_self_ins on person_acquisition_channel for insert to authenticated
  with check (person_id = current_person_id());
create policy pac_self_del on person_acquisition_channel for delete to authenticated
  using (person_id = current_person_id());

create policy reg_self_sel on registration for select to authenticated
  using (person_id = current_person_id());

create policy vocab_read_all on vocab_term for select to anon, authenticated
  using (true);

create policy event_read_auth on event for select to authenticated
  using (true);
-- organization / org_membership / staff_user: keine Policies -> nur service_role.

-- === GRANTs (auto_expose_new_tables ist aus -> explizit nötig) =============
grant usage on schema public to anon, authenticated, service_role;

-- service_role: voller Zugriff (bypasses RLS) auf aktuelle Tabellen/Views/Funktionen
grant all     on all tables    in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Öffentlich lesbar (Formulare rendern):
grant select on vocab_term to anon, authenticated;
grant select on event      to authenticated;

-- person: lesen + NUR Whitelist-Spalten schreiben (schützt score/flags/auth_user_id/...)
grant select on person to authenticated;
revoke update on person from authenticated;
grant update (
  first_name, last_name, birthdate, occupation_status, work_experience,
  career_level, employer_type, employer_name, study_field, study_program,
  university, self_assessment, linkedin_url, phone, gender, nationality,
  country, preferred_language, startup_phase, cv_url
) on person to authenticated;

-- Kind-Tabellen: lesen; Interessen/Kanäle selbst pflegen; E-Mails/Registrierungen nur lesen
grant select                 on person_email               to authenticated;
grant select, insert, delete on person_interest            to authenticated;
grant select, insert, delete on person_acquisition_channel to authenticated;
grant select                 on registration               to authenticated;

-- Funktions-Ausführung
grant execute on function current_person_id()          to anon, authenticated;
grant execute on function is_staff()                   to authenticated;
grant execute on function claim_or_create_person()     to authenticated;
grant execute on function set_primary_email(uuid)      to authenticated;
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
-- =============================================================================
-- 0005 · Vokabular-Seeds (idempotent) — neutrale Keys, DE/EN-Labels.
-- Labels aus der Airtable-Analyse übernommen. Als Migration (nicht seed.sql),
-- damit `supabase db push` sie auf dem Cloud-Projekt anwendet (kein lokaler reset).
-- Hierarchie: study_program.parent = study_field (nach study_field eingefügt).
-- =============================================================================
set search_path = public, extensions;

-- --- Nicht-hierarchische Vokabulare -----------------------------------------
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order) values
  -- occupation_status
  ('occupation_status','dualer-student','Dualer-Student','Dual student',1),
  ('occupation_status','bachelor','Bachelor-Student','Bachelor student',2),
  ('occupation_status','master','Master-Student','Master student',3),
  ('occupation_status','staatsexamen','Staatsexamen-Student','State examination student',4),
  ('occupation_status','postgraduate','Postgradual (MBA, Promotion)','Postgraduate (MBA, PhD)',5),
  ('occupation_status','founder','Founder','Founder',6),
  ('occupation_status','berufstaetig','Berufstätig','Employed',7),
  ('occupation_status','azubi','Azubi','Apprentice',8),
  ('occupation_status','schueler','Schüler','Pupil',9),
  ('occupation_status','auszeit-sonstiges','Auszeit, Sonstiges','Sabbatical, other',10),
  -- work_experience
  ('work_experience','0-1','0-1 Jahre','0-1 years',1),
  ('work_experience','2-3','2-3 Jahre','2-3 years',2),
  ('work_experience','4-5','4-5 Jahre','4-5 years',3),
  ('work_experience','6-7','6-7 Jahre','6-7 years',4),
  ('work_experience','8-9','8-9 Jahre','8-9 years',5),
  ('work_experience','10plus','10+ Jahre','10+ years',6),
  -- career_level
  ('career_level','intern','Intern','Intern',1),
  ('career_level','junior','Junior','Junior',2),
  ('career_level','mid','Mid-Level','Mid-Level',3),
  ('career_level','senior','Senior','Senior',4),
  ('career_level','team-lead','Team Lead','Team Lead',5),
  ('career_level','head-of','Head Of','Head Of',6),
  ('career_level','director','Director','Director',7),
  ('career_level','c-level','C-Level','C-Level',8),
  -- employer_type
  ('employer_type','startup','Startup','Startup',1),
  ('employer_type','kleinunternehmen','Kleinunternehmen','Small business',2),
  ('employer_type','mittelstand','Mittelstand','Mid-sized company',3),
  ('employer_type','corporate','Corporate','Corporate',4),
  ('employer_type','ngo','NGO / Non-Profit / Stiftung','NGO / non-profit / foundation',5),
  ('employer_type','public-uni','Öffentlicher Sektor / Universität','Public sector / university',6),
  ('employer_type','investor-vc','Investor / Family Office / VC','Investor / family office / VC',7),
  ('employer_type','agentur','Agentur','Agency',8),
  ('employer_type','selbststaendig','Selbstständig / Freelancer','Self-employed / freelancer',9),
  ('employer_type','ohne','ohne Arbeitgeber','No employer',10),
  ('employer_type','sonstiges','Sonstiges','Other',11),
  -- study_field (Parent für study_program)
  ('study_field','business','Business, Management & Entrepreneurship','Business, Management & Entrepreneurship',1),
  ('study_field','finance-econ','Finance & Economics','Finance & Economics',2),
  ('study_field','wirtschaftsinformatik','Wirtschaftsinformatik & Informatik','Business Informatics & Computer Science',3),
  ('study_field','wirtschaftsing','Wirtschaftsingenieurwesen & Ingenieurwissenschaften','Industrial & General Engineering',4),
  ('study_field','naturwiss','Naturwissenschaften','Natural Sciences',5),
  ('study_field','marketing-medien','Marketing, Medien & Kommunikation','Marketing, Media & Communication',6),
  ('study_field','sozialwiss-recht','Sozialwissenschaften & Recht','Social Sciences & Law',7),
  ('study_field','medizin-gesundheit','Medizin & Gesundheitswissenschaften','Medicine & Health Sciences',8),
  ('study_field','sonstiges','Sonstiges','Other',9),
  -- interests (14) — Labels sind bereits englisch
  ('interests','finance-banking','Finance & Banking','Finance & Banking',1),
  ('interests','tech-ai','Tech & AI','Tech & AI',2),
  ('interests','strategy-consulting','Strategy & Consulting','Strategy & Consulting',3),
  ('interests','impact-sustainability','Impact & Sustainability','Impact & Sustainability',4),
  ('interests','marketing-brand','Marketing & Brand','Marketing & Brand',5),
  ('interests','leadership-mgmt','Leadership & Management','Leadership & Management',6),
  ('interests','entrepreneurship-scaling','Entrepreneurship & Scaling','Entrepreneurship & Scaling',7),
  ('interests','health-wellbeing','Health & Wellbeing','Health & Wellbeing',8),
  ('interests','sales-growth','Sales & Growth','Sales & Growth',9),
  ('interests','engineering-tech','Engineering & Technology','Engineering & Technology',10),
  ('interests','logistics-operations','Logistics & Operations','Logistics & Operations',11),
  ('interests','psychology-behavior','Psychology & Behavior','Psychology & Behavior',12),
  ('interests','politics-society','Politics & Society','Politics & Society',13),
  ('interests','law-ethics','Law & Ethics','Law & Ethics',14),
  -- interests_founder (10)
  ('interests_founder','fundraising','Fundraising & Investoren','Fundraising & Investors',1),
  ('interests_founder','product-building','Product Building','Product Building',2),
  ('interests_founder','terms-contracts','Terms & Contracts','Terms & Contracts',3),
  ('interests_founder','growth-hacks','Growth Hacks','Growth Hacks',4),
  ('interests_founder','team-culture','Team & Culture','Team & Culture',5),
  ('interests_founder','sales-scaling','Sales & Scaling','Sales & Scaling',6),
  ('interests_founder','ideation-validation','Ideation & Validation','Ideation & Validation',7),
  ('interests_founder','mvp-prototyping','MVP Development & Prototyping','MVP Development & Prototyping',8),
  ('interests_founder','legal-ip-tax','Legal / IP & Tax Basics','Legal / IP & Tax Basics',9),
  ('interests_founder','cofounder-recruiting','Co-Founder Matching & Recruitment','Co-Founder Matching & Recruitment',10),
  -- startup_phase
  ('startup_phase','idee','Konzept/Idee','Concept/Idea',1),
  ('startup_phase','pre-seed','Pre-Seed','Pre-Seed',2),
  ('startup_phase','seed','Seed','Seed',3),
  ('startup_phase','early-stage','Early Stage','Early Stage',4),
  ('startup_phase','scale-up','Scale Up','Scale Up',5),
  ('startup_phase','later-stage','Later Stage','Later Stage',6),
  ('startup_phase','post-exit','Post-Exit','Post-Exit',7),
  -- career_opportunities
  ('career_opportunities','praktikum','Praktikum','Internship',1),
  ('career_opportunities','werkstudium','Werkstudium','Working student',2),
  ('career_opportunities','abschlussarbeit','Abschlussarbeit bei einem Unternehmen','Thesis with a company',3),
  ('career_opportunities','trainee','Trainee','Trainee',4),
  ('career_opportunities','einstieg-vz','Einstiegsjob - Vollzeit','Entry-level - full-time',5),
  ('career_opportunities','senior-vz','Senior - Vollzeit','Senior - full-time',6),
  ('career_opportunities','lead-vz','Team Lead/Manager - Vollzeit','Team lead/manager - full-time',7),
  ('career_opportunities','gruendungsfoerderung','Gründungsförderung / Incubator','Startup funding / incubator',8),
  ('career_opportunities','teilzeit','Teilzeit-Stelle','Part-time position',9),
  ('career_opportunities','nicht-interessiert','Ich bin aktuell nicht interessiert an Jobangeboten','Currently not interested in job offers',10),
  -- self_assessment
  ('self_assessment','top-1','Top 1%','Top 1%',1),
  ('self_assessment','top-10','Top 10%','Top 10%',2),
  ('self_assessment','top-25','Top 25%','Top 25%',3),
  ('self_assessment','top-50','Top 50%','Top 50%',4),
  ('self_assessment','sonstiges','Sonstiges','Other',5),
  ('self_assessment','keine-angabe','Keine Angabe','Prefer not to say',6),
  -- gender
  ('gender','maennlich','Männlich','Male',1),
  ('gender','weiblich','Weiblich','Female',2),
  ('gender','divers','Divers','Diverse',3),
  ('gender','keine-angabe','keine Angabe','Prefer not to say',4),
  -- registration_status
  ('registration_status','applied','Beworben','Applied',1),
  ('registration_status','waitlisted','Warteliste','Waitlisted',2),
  ('registration_status','confirmed','Bestätigt','Confirmed',3),
  ('registration_status','declined','Abgelehnt','Declined',4),
  ('registration_status','no_response','Keine Antwort','No response',5),
  ('registration_status','attended','Teilgenommen','Attended',6),
  ('registration_status','no_show','Nicht erschienen','No show',7),
  -- lifecycle_status
  ('lifecycle_status','lead','Lead','Lead',1),
  ('lifecycle_status','interested','Interessiert','Interested',2),
  ('lifecycle_status','applicant','Bewerber','Applicant',3),
  ('lifecycle_status','participant','Teilnehmer','Participant',4),
  ('lifecycle_status','alumni','Alumni','Alumni',5),
  -- format_tag
  ('format_tag','summit','Summit','Summit',1),
  ('format_tag','academy_hh','Academy Hamburg','Academy Hamburg',2),
  ('format_tag','academy_muc','Academy München','Academy Munich',3),
  ('format_tag','bootcamp_ai','Bootcamp AI','Bootcamp AI',4),
  ('format_tag','club_event','Club Event','Club Event',5),
  ('format_tag','speaker_night','Speaker Night','Speaker Night',6),
  ('format_tag','podcast','Podcast','Podcast',7),
  -- contact_role
  ('contact_role','primary_operations','Primär / Operativ','Primary / operations',1),
  ('contact_role','cc','CC','CC',2),
  ('contact_role','event_app_member','Event-App-Mitglied','Event app member',3),
  ('contact_role','signing','Zeichnungsberechtigt','Signing',4),
  ('contact_role','accounting','Buchhaltung','Accounting',5),
  -- partner_category
  ('partner_category','startup','Startup','Startup',1),
  ('partner_category','talent','Talent','Talent',2),
  -- doc_type
  ('doc_type','offer','Angebot','Offer',1),
  ('doc_type','invoice','Rechnung','Invoice',2),
  ('doc_type','logo_dark','Logo dunkel','Logo dark',3),
  ('doc_type','logo_light','Logo hell','Logo light',4),
  ('doc_type','backdrop','Backdrop','Backdrop',5),
  ('doc_type','other','Sonstiges','Other',6),
  -- ticket_type (neu)
  ('ticket_type','student','Student Pass','Student Pass',1),
  ('ticket_type','talent','Talent Pass','Talent Pass',2),
  ('ticket_type','startup','Startup Pass','Startup Pass',3),
  ('ticket_type','professional','Professional Pass','Professional Pass',4),
  ('ticket_type','investor','Investor Pass','Investor Pass',5),
  ('ticket_type','supporter','Supporter Pass','Supporter Pass',6),
  ('ticket_type','partner','Partner Pass','Partner Pass',7),
  ('ticket_type','speaker','Speaker Pass','Speaker Pass',8),
  ('ticket_type','crew','Crew Pass','Crew Pass',9),
  -- acquisition_channel (neu)
  ('acquisition_channel','instagram','Instagram','Instagram',1),
  ('acquisition_channel','linkedin','LinkedIn','LinkedIn',2),
  ('acquisition_channel','uni-prof','Uni oder Professor','University or professor',3),
  ('acquisition_channel','student-initiative','Studentische Initiative','Student initiative',4),
  ('acquisition_channel','friends-colleagues','Freunde oder Kollegen','Friends or colleagues',5),
  ('acquisition_channel','exhibitors-partners','Aussteller & Partner','Exhibitors & partners',6),
  ('acquisition_channel','past-events','Frühere Events','Past events',7),
  ('acquisition_channel','website-search','Website/Google Suche','Website/Google search',8),
  ('acquisition_channel','social-ads','Social Media Werbung','Social media ads',9),
  ('acquisition_channel','other','Anders','Other',10)
on conflict (vocabulary, key) do update set
  label_de = excluded.label_de, label_en = excluded.label_en,
  sort_order = excluded.sort_order, active = excluded.active,
  parent_vocabulary = excluded.parent_vocabulary, parent_key = excluded.parent_key;

-- --- study_program (hierarchisch: parent = study_field) ---------------------
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, parent_vocabulary, parent_key) values
  -- business
  ('study_program','business_bwl','BWL & Business Administration','Business Administration',1,'study_field','business'),
  ('study_program','business_intl','International Business & Management','International Business & Management',2,'study_field','business'),
  ('study_program','business_entrepreneurship','Entrepreneurship & Innovation Management','Entrepreneurship & Innovation Management',3,'study_field','business'),
  ('study_program','business_strategy_ops','Strategic & Operations Management','Strategic & Operations Management',4,'study_field','business'),
  ('study_program','business_risk_compliance','Versicherungs-, Risikomanagement & Compliance','Insurance, Risk Management & Compliance',5,'study_field','business'),
  ('study_program','business_impact','Impact & Sustainability Management','Impact & Sustainability Management',6,'study_field','business'),
  ('study_program','business_wipsych','Wirtschaftspsychologie','Business Psychology',7,'study_field','business'),
  ('study_program','business_logistics','Logistik & Supply Chain Management','Logistics & Supply Chain Management',8,'study_field','business'),
  ('study_program','business_sonstiges','Sonstiges','Other',9,'study_field','business'),
  -- finance-econ
  ('study_program','finance_corp','Finance & Corporate Finance','Finance & Corporate Finance',1,'study_field','finance-econ'),
  ('study_program','finance_vwl','VWL & Economics','Economics',2,'study_field','finance-econ'),
  ('study_program','finance_banking','Banking','Banking',3,'study_field','finance-econ'),
  ('study_program','finance_controlling','Controlling','Controlling',4,'study_field','finance-econ'),
  ('study_program','finance_sonstiges','Sonstiges','Other',5,'study_field','finance-econ'),
  -- wirtschaftsinformatik
  ('study_program','winf_wirtschaftsinformatik','Wirtschaftsinformatik','Business Informatics',1,'study_field','wirtschaftsinformatik'),
  ('study_program','winf_informatik','Informatik','Computer Science',2,'study_field','wirtschaftsinformatik'),
  ('study_program','winf_business_analytics','Business Analytics','Business Analytics',3,'study_field','wirtschaftsinformatik'),
  ('study_program','winf_data_science','Data Science, ML & AI','Data Science, ML & AI',4,'study_field','wirtschaftsinformatik'),
  ('study_program','winf_it_mgmt','IT Management & Digital Business','IT Management & Digital Business',5,'study_field','wirtschaftsinformatik'),
  ('study_program','winf_sonstiges','Sonstiges','Other',6,'study_field','wirtschaftsinformatik'),
  -- wirtschaftsing
  ('study_program','wing_wirtschaftsing','Wirtschaftsingenieurwesen','Industrial Engineering',1,'study_field','wirtschaftsing'),
  ('study_program','wing_ingenieurwesen','Ingenieurwesen','Engineering',2,'study_field','wirtschaftsing'),
  ('study_program','wing_maschinenbau','Maschinenbau','Mechanical Engineering',3,'study_field','wirtschaftsing'),
  ('study_program','wing_luftraumfahrt','Luft- & Raumfahrttechnik','Aerospace Engineering',4,'study_field','wirtschaftsing'),
  ('study_program','wing_sonstiges','Sonstiges','Other',5,'study_field','wirtschaftsing'),
  -- naturwiss
  ('study_program','nat_physik','Physik','Physics',1,'study_field','naturwiss'),
  ('study_program','nat_mathematik','Mathematik','Mathematics',2,'study_field','naturwiss'),
  ('study_program','nat_biologie','Biologie','Biology',3,'study_field','naturwiss'),
  ('study_program','nat_chemie','Chemie','Chemistry',4,'study_field','naturwiss'),
  ('study_program','nat_materialwiss','Materialwissenschaften','Materials Science',5,'study_field','naturwiss'),
  ('study_program','nat_astronomie','Astronomie','Astronomy',6,'study_field','naturwiss'),
  ('study_program','nat_sonstiges','Sonstiges','Other',7,'study_field','naturwiss'),
  -- marketing-medien
  ('study_program','mkt_marketing_social','Marketing & Social Media','Marketing & Social Media',1,'study_field','marketing-medien'),
  ('study_program','mkt_brand','Brand Management','Brand Management',2,'study_field','marketing-medien'),
  ('study_program','mkt_pr','PR & Kommunikation','PR & Communication',3,'study_field','marketing-medien'),
  ('study_program','mkt_journalismus','Journalismus','Journalism',4,'study_field','marketing-medien'),
  ('study_program','mkt_design','Design & Grafikdesign','Design & Graphic Design',5,'study_field','marketing-medien'),
  ('study_program','mkt_media_mgmt','Media Management','Media Management',6,'study_field','marketing-medien'),
  ('study_program','mkt_sonstiges','Sonstiges','Other',7,'study_field','marketing-medien'),
  -- sozialwiss-recht
  ('study_program','soz_jura','Jura & Rechtswissenschaften','Law',1,'study_field','sozialwiss-recht'),
  ('study_program','soz_wirtschaftsrecht','Wirtschaftsrecht','Business Law',2,'study_field','sozialwiss-recht'),
  ('study_program','soz_politik','Politikwissenschaften & Internationale Beziehungen','Political Science & International Relations',3,'study_field','sozialwiss-recht'),
  ('study_program','soz_soziologie','Soziologie & Sozialökonomie','Sociology & Socioeconomics',4,'study_field','sozialwiss-recht'),
  ('study_program','soz_geschichte','Geschichte & Wirtschaftsgeschichte','History & Economic History',5,'study_field','sozialwiss-recht'),
  ('study_program','soz_lehramt','Lehramt & Bildungswissenschaften','Teaching & Education',6,'study_field','sozialwiss-recht'),
  ('study_program','soz_social_sciences','Social Sciences','Social Sciences',7,'study_field','sozialwiss-recht'),
  ('study_program','soz_sonstiges','Sonstiges','Other',8,'study_field','sozialwiss-recht'),
  -- medizin-gesundheit
  ('study_program','med_medizin','Medizin','Medicine',1,'study_field','medizin-gesundheit'),
  ('study_program','med_sportmanagement','Sportmanagement','Sports Management',2,'study_field','medizin-gesundheit'),
  ('study_program','med_gesundheitsmgmt','Gesundheitsmanagement','Health Management',3,'study_field','medizin-gesundheit'),
  ('study_program','med_psychologie','Psychologie','Psychology',4,'study_field','medizin-gesundheit'),
  ('study_program','med_pharmazie','Pharmazie','Pharmacy',5,'study_field','medizin-gesundheit'),
  ('study_program','med_sonstiges','Sonstiges','Other',6,'study_field','medizin-gesundheit')
on conflict (vocabulary, key) do update set
  label_de = excluded.label_de, label_en = excluded.label_en,
  sort_order = excluded.sort_order, active = excluded.active,
  parent_vocabulary = excluded.parent_vocabulary, parent_key = excluded.parent_key;

-- PostgREST-Schema-Cache neu laden, damit die Tabellen sofort sichtbar sind:
notify pgrst, 'reload schema';
