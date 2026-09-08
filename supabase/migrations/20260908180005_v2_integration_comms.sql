-- =============================================================================
-- 0010 · v2 Integration & Kommunikation
--   Schema integration (nicht über die Data-API exponiert): webhook_event
--   (Idempotenz je Quelle + Event-ID), sync_job, sync_error ·
--   public.external_ref (Fremd-IDs je Objekt) · mail_template (DE/EN, versioniert) ·
--   mail_log (Zustellstatus) · is_suppressed()
-- Regel (Masterplan §2): Logik in Supabase, make.com nur Transport. Jeder Webhook
-- landet zuerst hier, wird dann idempotent verarbeitet.
-- =============================================================================
set search_path = public, extensions;

-- === Schema integration =====================================================
create schema if not exists integration;
revoke all on schema integration from public, anon, authenticated;
grant usage on schema integration to service_role;

create table if not exists integration.webhook_event (
  id              bigint      generated always as identity primary key,
  source          text        not null,                    -- vivenu / hubspot / luma / swapcard / resend / make
  event_type      text        not null,
  external_id     text,                                    -- Event-/Delivery-ID des Absenders
  signature_valid boolean,
  payload         jsonb       not null,
  headers         jsonb,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  status          text        not null default 'received'
                  check (status in ('received','processed','failed','ignored','duplicate')),
  attempts        integer     not null default 0,
  error           text,
  related_type    text,                                    -- z. B. ticket / organization
  related_id      uuid
);
create unique index if not exists webhook_event_source_ext_uidx
  on integration.webhook_event (source, external_id) where external_id is not null;
create index if not exists webhook_event_status_idx on integration.webhook_event (status, received_at);
create index if not exists webhook_event_source_idx on integration.webhook_event (source, event_type, received_at desc);
comment on table integration.webhook_event is 'Eingangsprotokoll aller Webhooks. Unique (source, external_id) macht Wiederholungen unschädlich.';

create table if not exists integration.sync_job (
  id           bigint      generated always as identity primary key,
  system       text        not null,                       -- vivenu / swapcard / hubspot / activecampaign / sevdesk / sanity
  direction    text        not null check (direction in ('in','out')),
  job_type     text        not null,                       -- z. B. swapcard.people / vivenu.sweep
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text        not null default 'running' check (status in ('running','ok','partial','failed')),
  stats        jsonb       not null default '{}',
  error        text,
  triggered_by text                                        -- cron / manual:<person_id> / webhook:<id>
);
create index if not exists sync_job_system_idx on integration.sync_job (system, started_at desc);
comment on table integration.sync_job is 'Ein Lauf einer Synchronisation mit Statistik (Sync-Reports im Admin).';

create table if not exists integration.sync_error (
  id          bigint      generated always as identity primary key,
  job_id      bigint      references integration.sync_job (id) on delete cascade,
  object_type text,
  object_id   text,
  message     text        not null,
  payload     jsonb,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists sync_error_job_idx on integration.sync_error (job_id);
comment on table integration.sync_error is 'Fehlerliste je Lauf (Retry-Grundlage).';

-- === public.external_ref ====================================================
create table if not exists external_ref (
  id          uuid        primary key default gen_random_uuid(),
  system      text        not null,                        -- hubspot / sevdesk / swapcard / vivenu / sanity / airtable
  object_type text        not null,                        -- person / organization / session / product / ticket …
  object_id   uuid        not null,
  external_id text        not null,
  meta        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (system, object_type, object_id),
  unique (system, object_type, external_id)
);
create index if not exists external_ref_object_idx on external_ref (object_type, object_id);
drop trigger if exists trg_external_ref_updated on external_ref;
create trigger trg_external_ref_updated before update on external_ref for each row execute function set_updated_at();
comment on table external_ref is 'Fremd-IDs je Portal-Objekt (ein System ↔ ein Objekt ↔ eine ID).';

-- === mail_template ==========================================================
create table if not exists mail_template (
  key         text        not null,                        -- z. B. application_accepted
  locale      text        not null check (locale in ('de','en')),
  version     integer     not null default 1,
  subject     text        not null,
  body_md     text        not null,                        -- Markdown mit {{variablen}}
  description text,
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (key, locale)
);
drop trigger if exists trg_mail_template_updated on mail_template;
create trigger trg_mail_template_updated before update on mail_template for each row execute function set_updated_at();
comment on table mail_template is 'System-Mails DE/EN. Versand über Resend (lib/mail), Rendering aus Markdown.';

-- === mail_log ===============================================================
create table if not exists mail_log (
  id           bigint      generated always as identity primary key,
  to_email     citext      not null,
  person_id    uuid        references person (id) on delete set null,
  template_key text,
  locale       text,
  subject      text,
  provider     text        not null default 'resend',
  provider_id  text,
  status       text        not null default 'queued'
               check (status in ('queued','sent','delivered','bounced','complained','failed','suppressed')),
  error        text,
  meta         jsonb,
  related_type text,
  related_id   uuid,
  queued_at    timestamptz not null default now(),
  sent_at      timestamptz,
  updated_at   timestamptz not null default now()
);
create index if not exists mail_log_person_idx   on mail_log (person_id, queued_at desc);
create index if not exists mail_log_status_idx   on mail_log (status, queued_at);
create index if not exists mail_log_provider_idx on mail_log (provider_id);
drop trigger if exists trg_mail_log_updated on mail_log;
create trigger trg_mail_log_updated before update on mail_log for each row execute function set_updated_at();
comment on table mail_log is 'Jede versendete oder unterdrückte Mail mit Zustellstatus (Resend-Webhooks aktualisieren status).';

-- === is_suppressed ==========================================================
create or replace function is_suppressed(p_email text) returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from suppression where email_hash = email_hash(p_email))
$$;
revoke execute on function is_suppressed(text) from public, anon, authenticated;

-- === RLS (alles service-role-only) ==========================================
alter table integration.webhook_event enable row level security;
alter table integration.sync_job      enable row level security;
alter table integration.sync_error    enable row level security;
alter table external_ref              enable row level security;
alter table mail_template             enable row level security;
alter table mail_log                  enable row level security;

-- === GRANTs =================================================================
grant all on all tables    in schema integration to service_role;
grant all on all sequences in schema integration to service_role;
grant all on external_ref, mail_template, mail_log to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function is_suppressed(text) to service_role;
