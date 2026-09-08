-- =============================================================================
-- 0006 · v2 Identität & Rollen
--   person/organization erweitert · role_assignment (Scopes) · consent_record ·
--   suppression · audit_log · Helper has_role/is_admin/is_staff/my_roles ·
--   RPC delete_my_profile (Anonymisierung + Suppression)
-- Konvention wie 0001. RLS default deny; Nutzer lesen nur eigene Zeilen,
-- Staff schreibt serverseitig (service_role) nach requireRole().
-- Alle SECURITY-DEFINER-Funktionen pinnen den search_path.
-- =============================================================================
set search_path = public, extensions;

create extension if not exists btree_gist with schema extensions;  -- Exclusion-Constraints (0007)
create extension if not exists pgcrypto   with schema extensions;  -- digest() für E-Mail-Hash

-- === person: Erweiterungen ==================================================
alter table person
  add column if not exists title      text,
  add column if not exists city       text,
  add column if not exists pronouns   text,
  add column if not exists photo_url  text,
  add column if not exists tier       text not null default 'lead',
  add column if not exists deleted_at timestamptz;
alter table person drop constraint if exists person_tier_chk;
alter table person add constraint person_tier_chk check (tier in ('lead','talent'));
comment on table  person            is 'Eine natürliche Person = ein Datensatz. Login-Verknüpfung über auth_user_id.';
comment on column person.tier       is 'lead = bekannt ohne Login · talent = hat sich eingeloggt (Claim). Wird per Trigger gesetzt.';
comment on column person.deleted_at is 'Gesetzt durch delete_my_profile(): Datensatz anonymisiert, Historie bleibt.';

create or replace function person_tier_on_claim() returns trigger
language plpgsql as $$
begin
  if new.auth_user_id is not null then
    new.tier := 'talent';
  end if;
  return new;
end $$;
drop trigger if exists trg_person_tier on person;
create trigger trg_person_tier before insert or update of auth_user_id on person
  for each row execute function person_tier_on_claim();

-- === organization: Erweiterungen ============================================
alter table organization
  add column if not exists type               text,      -- vocab organization_type
  add column if not exists slug               text,
  add column if not exists website            text,
  add column if not exists active             boolean not null default true,
  add column if not exists sevdesk_contact_id text;
create unique index if not exists organization_slug_uidx on organization (slug) where slug is not null;
comment on table organization is 'Partner, Startups, Initiativen, Hochschulen, Agenturen. HubSpot-Company über hubspot_id.';

-- === role_assignment (Rollen mit Scope, edition-gebunden) ==================
create table if not exists role_assignment (
  id           uuid        primary key default gen_random_uuid(),
  person_id    uuid        not null references person (id) on delete cascade,
  role         text        not null,                     -- vocab role
  scope_type   text        not null default 'global'
               check (scope_type in ('global','edition','portal','org','stage','stage_day','slot')),
  scope_id     uuid,                                     -- org / stage / stage_day / slot (je scope_type)
  edition_id   uuid        references event (id) on delete cascade,  -- Edition (event.is_edition)
  portal       text,                                     -- nur scope_type = portal
  valid_from   timestamptz not null default now(),
  valid_to     timestamptz,
  granted_by   uuid        references person (id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint role_assignment_scope_chk check (
       (scope_type = 'global'  and scope_id is null and portal is null)
    or (scope_type = 'edition' and scope_id is null and portal is null and edition_id is not null)
    or (scope_type = 'portal'  and scope_id is null and portal is not null)
    or (scope_type in ('org','stage','stage_day','slot') and scope_id is not null and portal is null)
  ),
  constraint role_assignment_valid_chk check (valid_to is null or valid_to > valid_from)
);
create unique index if not exists role_assignment_uidx on role_assignment (
  person_id, role, scope_type,
  coalesce(scope_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(portal, '')
);
create index if not exists role_assignment_person_idx  on role_assignment (person_id);
create index if not exists role_assignment_scope_idx   on role_assignment (scope_type, scope_id);
create index if not exists role_assignment_edition_idx on role_assignment (edition_id);
drop trigger if exists trg_role_assignment_updated on role_assignment;
create trigger trg_role_assignment_updated before update on role_assignment
  for each row execute function set_updated_at();
comment on table role_assignment is 'Rolle × Scope je Person. Rollen außer admin sind edition-gebunden (edition_id). Schreiben nur service_role.';

-- === consent_record (versionierte Einwilligungen) ==========================
create table if not exists consent_record (
  id           uuid        primary key default gen_random_uuid(),
  person_id    uuid        not null references person (id) on delete cascade,
  consent_type text        not null,                     -- vocab consent_type
  version      text        not null,                     -- Textversion, z. B. 2026-11-v1
  granted      boolean     not null,
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  source       text        not null default 'portal',    -- portal / import / vivenu / paper
  ip_hash      text,
  user_agent   text,
  meta         jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists consent_record_person_idx on consent_record (person_id, consent_type, granted_at desc);
comment on table consent_record is 'Jede Einwilligung/Widerruf als eigene Zeile (Nachweis). Aktueller Stand: View consent_current.';

create or replace view consent_current with (security_invoker = true) as
  select distinct on (person_id, consent_type)
         person_id, consent_type, version, granted, granted_at, revoked_at
  from consent_record
  order by person_id, consent_type, granted_at desc;

-- === suppression (gehashte E-Mail nach Profil-Löschung) ====================
create or replace function email_hash(p_email text) returns text
  language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(lower(trim(p_email)), 'sha256'), 'hex')
$$;

create table if not exists suppression (
  email_hash text        primary key,                    -- email_hash(email)
  reason     text        not null default 'profile_deleted',
  created_at timestamptz not null default now()
);
comment on table suppression is 'sha256(lower(email)) gelöschter/gesperrter Adressen. Vor jedem Import und Mailversand prüfen.';

-- === audit_log ==============================================================
create table if not exists audit_log (
  id              bigint      generated always as identity primary key,
  actor_person_id uuid        references person (id) on delete set null,
  actor_auth_uid  uuid,
  action          text        not null,                  -- role.grant · slot.move · application.decide · export …
  object_type     text,
  object_id       text,
  before          jsonb,
  after           jsonb,
  ip_hash         text,
  created_at      timestamptz not null default now()
);
create index if not exists audit_log_object_idx on audit_log (object_type, object_id);
create index if not exists audit_log_actor_idx  on audit_log (actor_person_id, created_at desc);
comment on table audit_log is 'Admin-/Manager-Aktionen, Partner-Zugriffe auf Bewerberdaten, Exporte. Nur service_role liest.';

create or replace function log_audit(
  p_action text, p_object_type text, p_object_id text,
  p_before jsonb default null, p_after jsonb default null
) returns void
  language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into audit_log (actor_person_id, actor_auth_uid, action, object_type, object_id, before, after)
  values (current_person_id(), auth.uid(), p_action, p_object_type, p_object_id, p_before, p_after);
end $$;
revoke execute on function log_audit(text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- === Helper =================================================================
-- has_role(role)                          -> irgendeine aktive Zuweisung der Rolle
-- has_role(role, scope_type, scope_id)    -> exakter Scope ODER globale Zuweisung
-- has_role(role, 'edition', null, ed_id)  -> Edition-Scope ODER global
create or replace function has_role(
  p_role text, p_scope_type text default null, p_scope_id uuid default null, p_edition_id uuid default null
) returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from role_assignment ra
    where ra.person_id = current_person_id()
      and ra.role = p_role
      and ra.valid_from <= now()
      and (ra.valid_to is null or ra.valid_to > now())
      and (
           ra.scope_type = 'global'
        or p_scope_type is null
        or (ra.scope_type = p_scope_type
            and (p_scope_id is null or ra.scope_id = p_scope_id)
            and (p_edition_id is null or ra.edition_id = p_edition_id))
      )
  )
$$;

create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select has_role('admin')
$$;

-- is_staff: Team-Rollen ODER bestehende staff_user-Zeile (kompatibel zu 0003)
create or replace function is_staff() returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from staff_user where auth_user_id = auth.uid())
      or exists (
        select 1 from role_assignment ra
        where ra.person_id = current_person_id()
          and ra.valid_from <= now()
          and (ra.valid_to is null or ra.valid_to > now())
          and (ra.role in ('admin','programme_team','production_team') or ra.role like 'area_lead_%')
      )
$$;

create or replace function my_roles()
returns table (role text, scope_type text, scope_id uuid, edition_id uuid, portal text, valid_to timestamptz)
  language sql stable security definer set search_path = public, extensions as $$
  select role, scope_type, scope_id, edition_id, portal, valid_to
  from role_assignment
  where person_id = current_person_id()
    and valid_from <= now()
    and (valid_to is null or valid_to > now())
$$;

-- === delete_my_profile: Anonymisieren statt physisch löschen ===============
-- Historie (Registrierungen, Bewerbungen, Consent-Nachweis) bleibt pseudonym erhalten;
-- alle Adressen wandern gehasht in suppression; der Auth-User wird danach serverseitig
-- (Admin-API) gelöscht — siehe Runbook „Profil löschen".
create or replace function delete_my_profile() returns void
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid uuid := current_person_id();
begin
  if v_pid is null then
    raise exception 'no person for current user' using errcode = '28000';
  end if;

  perform log_audit('profile.delete', 'person', v_pid::text, null, null);

  insert into suppression (email_hash, reason)
    select email_hash(email::text), 'profile_deleted' from person_email where person_id = v_pid
  on conflict (email_hash) do nothing;

  delete from person_interest            where person_id = v_pid;
  delete from person_acquisition_channel where person_id = v_pid;
  delete from role_assignment            where person_id = v_pid;

  update person set
    first_name = null, last_name = null, birthdate = null, phone = null, phone_e164 = null,
    linkedin_url = null, linkedin_normalized = null, cv_url = null, photo_url = null,
    employer_name = null, university = null, title = null, city = null, pronouns = null,
    nationality = null, invite_code = null, auth_user_id = null, deleted_at = now()
  where id = v_pid;

  -- Invariante „genau eine primäre E-Mail" bleibt erhalten: primäre anonymisieren, Rest löschen.
  delete from person_email where person_id = v_pid and not is_primary;
  update person_email
     set email = ('deleted+' || v_pid::text || '@anonym.invalid')::citext, verified = false
   where person_id = v_pid and is_primary;
end $$;

-- === RLS ====================================================================
alter table role_assignment enable row level security;
alter table consent_record  enable row level security;
alter table suppression     enable row level security;
alter table audit_log       enable row level security;

drop policy if exists ra_self_sel on role_assignment;
create policy ra_self_sel on role_assignment for select to authenticated
  using (person_id = current_person_id());

drop policy if exists cr_self_sel on consent_record;
create policy cr_self_sel on consent_record for select to authenticated
  using (person_id = current_person_id());
drop policy if exists cr_self_ins on consent_record;
create policy cr_self_ins on consent_record for insert to authenticated
  with check (person_id = current_person_id() and source = 'portal');
-- suppression / audit_log: keine Policies -> nur service_role.

-- === GRANTs =================================================================
grant all on role_assignment, consent_record, consent_current, suppression, audit_log to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select         on role_assignment to authenticated;
grant select, insert on consent_record  to authenticated;
grant select         on consent_current to authenticated;
grant update (title, city, pronouns, photo_url) on person to authenticated;

grant execute on function has_role(text, text, uuid, uuid) to authenticated;
grant execute on function is_admin()                       to authenticated;
grant execute on function is_staff()                       to authenticated;
grant execute on function my_roles()                       to authenticated;
grant execute on function delete_my_profile()              to authenticated;
grant execute on function email_hash(text)                 to authenticated, service_role;
revoke execute on function person_tier_on_claim() from public, anon, authenticated;
