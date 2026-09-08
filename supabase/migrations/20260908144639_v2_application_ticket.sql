-- =============================================================================
-- 0009 · v2 Bewerbung, Anmeldung & Tickets
--   question_catalog · session_question (max. 2 eigene) · application (Status-
--   Maschine) · decision_release (Freigabe-Gate) · registration.session_id ·
--   ticket_type_map · ticket · org_ticket_allocation · checkin ·
--   RPCs für Talents (apply/withdraw/confirm/register/cancel/personalize) und
--   für Entscheider (decide/release/promote/expire) · my_applications() maskiert
--   Entscheidungen bis zur Freigabe.
-- Wahrheit: Ticket/Barcode = vivenu · Profil und Bewerbung = Portal.
-- =============================================================================
set search_path = public, extensions;

-- === question_catalog =======================================================
create table if not exists question_catalog (
  id         uuid        primary key default gen_random_uuid(),
  key        text        not null unique,
  label_de   text        not null,
  label_en   text        not null,
  help_de    text,
  help_en    text,
  type       text        not null check (type in ('text','textarea','select','multiselect','boolean','url','file','number')),
  options    jsonb,                                       -- [{key,label_de,label_en}]
  active     boolean     not null default true,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_question_catalog_updated on question_catalog;
create trigger trg_question_catalog_updated before update on question_catalog for each row execute function set_updated_at();
comment on table question_catalog is 'Zentraler Fragenkatalog für Bewerbungen (Antwort C: Katalog + max. 2 eigene Fragen je Session).';

-- === session_question =======================================================
create table if not exists session_question (
  id          uuid        primary key default gen_random_uuid(),
  session_id  uuid        not null references session (id) on delete cascade,
  question_id uuid        references question_catalog (id) on delete restrict,   -- null = eigene Frage
  label_de    text,
  label_en    text,
  type        text        check (type in ('text','textarea','select','multiselect','boolean','url','file','number')),
  options     jsonb,
  required    boolean     not null default false,
  sort_order  integer     not null default 0,
  approved_by uuid        references person (id) on delete set null,
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint sq_catalog_or_custom check (question_id is not null or (label_de is not null and type is not null))
);
create index if not exists session_question_session_idx on session_question (session_id, sort_order);
comment on table session_question is 'Fragen einer Session: aus dem Katalog oder eigene (max. 2, Freigabe durch Programm-Team).';

create or replace function session_question_limit() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.question_id is null and (
      select count(*) from session_question
      where session_id = new.session_id and question_id is null and id <> new.id) >= 2 then
    raise exception 'max 2 custom questions per session' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_session_question_limit on session_question;
create trigger trg_session_question_limit before insert or update on session_question
  for each row execute function session_question_limit();

-- === application ============================================================
create table if not exists application (
  id            uuid        primary key default gen_random_uuid(),
  session_id    uuid        not null references session (id) on delete cascade,
  person_id     uuid        not null references person (id) on delete cascade,
  status        text        not null default 'applied'
                check (status in ('applied','shortlisted','accepted','confirmed','attended','no_show',
                                  'waitlisted','promoted','declined','expired','withdrawn')),
  rank          integer,
  answers       jsonb       not null default '{}',
  consent_share boolean     not null default false,          -- Daten an Host-Partner weitergeben
  decided_by    uuid        references person (id) on delete set null,
  decided_at    timestamptz,
  confirm_by    timestamptz,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (session_id, person_id)
);
create index if not exists application_session_idx on application (session_id, status);
create index if not exists application_person_idx  on application (person_id);
drop trigger if exists trg_application_updated on application;
create trigger trg_application_updated before update on application for each row execute function set_updated_at();
comment on table  application        is 'Bewerbung Person × Session. Pipeline: applied → shortlisted → accepted → confirmed → attended/no_show | waitlisted → promoted | declined/expired/withdrawn.';
comment on column application.status is 'Bewerber sehen Entscheidungen erst nach decision_release (my_applications()).';

-- === decision_release (Freigabe-Gate für Mails/Sichtbarkeit) ===============
create table if not exists decision_release (
  id          uuid        primary key default gen_random_uuid(),
  session_id  uuid        not null unique references session (id) on delete cascade,
  released_by uuid        references person (id) on delete set null,
  released_at timestamptz not null default now(),
  note        text
);
comment on table decision_release is 'Erst nach Freigabe werden Zusagen/Absagen sichtbar und Mails ausgelöst (Antwort C).';

-- === registration: Session-Anmeldung (open/registration-Formate) ============
alter table registration add column if not exists session_id uuid references session (id) on delete set null;
create unique index if not exists registration_person_session_uidx
  on registration (person_id, session_id) where session_id is not null;
create index if not exists registration_session_idx on registration (session_id);
comment on column registration.session_id is 'Gesetzt bei Anmeldung zu einer Session (access_mode registration); null bei Event-Registrierungen.';

-- === ticket_type_map ========================================================
create table if not exists ticket_type_map (
  id                    uuid        primary key default gen_random_uuid(),
  event_id              uuid        not null references event (id) on delete cascade,
  vivenu_ticket_type_id text        not null,
  vivenu_ticket_name    text,
  pass_type             text        not null,                 -- vocab ticket_type
  swapcard_group        text,
  rights                jsonb       not null default '{}',
  active                boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (event_id, vivenu_ticket_type_id)
);
drop trigger if exists trg_ticket_type_map_updated on ticket_type_map;
create trigger trg_ticket_type_map_updated before update on ticket_type_map for each row execute function set_updated_at();
comment on table ticket_type_map is 'vivenu-Tickettyp ↔ Pass-Typ ↔ Swapcard-Gruppe/Rechte (Antwort 53: eine Gruppe je Pass-Typ).';

-- === ticket =================================================================
create table if not exists ticket (
  id                     uuid        primary key default gen_random_uuid(),
  event_id               uuid        not null references event (id) on delete cascade,
  person_id              uuid        references person (id) on delete set null,      -- Inhaber (nach Personalisierung/Claim)
  ticket_type_map_id     uuid        references ticket_type_map (id) on delete set null,
  pass_type              text,                                                        -- vocab ticket_type (denormalisiert)
  barcode                text        not null unique,                                 -- = der QR (vivenu)
  vivenu_ticket_id       text        unique,
  vivenu_transaction_id  text,
  vivenu_customer_id     text,
  buyer_email            citext,
  holder_email           citext,
  holder_first_name      text,
  holder_last_name       text,
  holder_company         text,
  holder_position        text,
  status                 text        not null default 'valid'
                         check (status in ('valid','cancelled','refunded','checked_in','blocked')),
  personalization_status text        not null default 'pending'
                         check (personalization_status in ('pending','partial','complete')),
  addons                 jsonb       not null default '[]',
  price_cents            integer,
  currency               text        not null default 'EUR',
  source                 text        not null default 'vivenu',                       -- vivenu / crew / speaker / partner_code
  purchased_at           timestamptz,
  personalized_at        timestamptz,
  checked_in_at          timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists ticket_event_idx        on ticket (event_id, status);
create index if not exists ticket_person_idx       on ticket (person_id);
create index if not exists ticket_holder_email_idx on ticket (holder_email);
create index if not exists ticket_buyer_email_idx  on ticket (buyer_email);
create index if not exists ticket_txn_idx          on ticket (vivenu_transaction_id);
drop trigger if exists trg_ticket_updated on ticket;
create trigger trg_ticket_updated before update on ticket for each row execute function set_updated_at();
comment on table  ticket                 is 'Ticket aus vivenu (Barcode = QR) oder Freiticket (Crew/Speaker). Badge-Felder werden nach vivenu zurückgeschrieben.';
comment on column ticket.holder_email    is 'E-Mail der Person, für die das Ticket personalisiert wurde (kann vom Käufer abweichen).';

-- === org_ticket_allocation ==================================================
create table if not exists org_ticket_allocation (
  id            uuid        primary key default gen_random_uuid(),
  event_id      uuid        not null references event (id) on delete cascade,
  org_id        uuid        not null references organization (id) on delete cascade,
  pass_type     text        not null,
  quantity      integer     not null check (quantity >= 0),
  coupon_code   text,
  undershop_url text,
  used_count    integer     not null default 0,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (event_id, org_id, pass_type)
);
drop trigger if exists trg_org_ticket_allocation_updated on org_ticket_allocation;
create trigger trg_org_ticket_allocation_updated before update on org_ticket_allocation for each row execute function set_updated_at();
comment on table org_ticket_allocation is 'Ticket-Kontingent je Partner (Code/Secret Shop) und Pass-Typ.';

-- === checkin ================================================================
create table if not exists checkin (
  id                 bigint      generated always as identity primary key,
  ticket_id          uuid        not null references ticket (id) on delete cascade,
  scanned_at         timestamptz not null default now(),
  device_id          text,
  operator_person_id uuid        references person (id) on delete set null,
  location           text,
  result             text        not null default 'ok' check (result in ('ok','duplicate','invalid','blocked')),
  created_at         timestamptz not null default now()
);
create index if not exists checkin_ticket_idx on checkin (ticket_id, scanned_at desc);
comment on table checkin is 'Scan-Ereignisse (Kiosk-Rolle). Setup Einlass offen (vivenu-Support Frage 11).';

-- === Helper =================================================================
create or replace function is_member_of_org(p_org_id uuid) returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from org_membership om
                 where om.org_id = p_org_id and om.person_id = current_person_id())
      or has_role('partner_contact', 'org', p_org_id)
$$;

-- Entscheider: Programm-Team/Admin (Edition/global) oder Partner-Kontakt der Host-Organisation
create or replace function can_decide_session(p_session_id uuid) returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1
    from session se
    join event ev on ev.id = se.event_id
    where se.id = p_session_id
      and (
           has_role('admin')
        or has_role('programme_team', 'edition', null, ev.edition_id)
        or has_role('programme_team', 'edition', null, ev.id)
        or has_role('area_lead_talent')
        or (se.host_org_id is not null and is_member_of_org(se.host_org_id))
      )
  )
$$;

create or replace function decisions_released(p_session_id uuid) returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from decision_release where session_id = p_session_id)
$$;

-- === Talent: my_applications() — Status maskiert bis zur Freigabe ==========
create or replace function my_applications()
returns table (
  id uuid, session_id uuid, status text, answers jsonb, consent_share boolean,
  confirm_by timestamptz, confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz
)
  language sql stable security definer set search_path = public, extensions as $$
  select a.id, a.session_id,
         case
           when a.status in ('applied','shortlisted') then 'applied'
           when a.status in ('accepted','promoted','waitlisted','declined')
                and not decisions_released(a.session_id) then 'applied'
           when a.status = 'promoted' then 'accepted'
           else a.status
         end as status,
         a.answers, a.consent_share, a.confirm_by, a.confirmed_at, a.created_at, a.updated_at
  from application a
  where a.person_id = current_person_id()
$$;

-- === Talent: apply_to_session ==============================================
create or replace function apply_to_session(
  p_session_id uuid, p_answers jsonb default '{}'::jsonb, p_consent_share boolean default false
) returns uuid
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid  uuid := current_person_id();
  v_s    session%rowtype;
  v_p    person%rowtype;
  v_rule jsonb;
  v_id   uuid;
begin
  if v_pid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_s from session where id = p_session_id;
  if not found or v_s.publish_status <> 'published' then
    raise exception 'session_not_open' using errcode = 'P0002';
  end if;
  if v_s.access_mode <> 'application' then
    raise exception 'session_not_application' using errcode = '22023';
  end if;
  if v_s.application_deadline is not null and v_s.application_deadline < now() then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;

  select * into v_p from person where id = v_pid;
  v_rule := coalesce(v_s.eligibility_rule, '{}'::jsonb);
  if coalesce((v_rule->>'u35')::boolean, false) and coalesce(is_u35(v_p.birthdate), false) is not true then
    raise exception 'not_eligible' using errcode = 'P0001', detail = 'u35';
  end if;
  if v_rule ? 'occupation_status'
     and not (v_rule->'occupation_status') ? coalesce(v_p.occupation_status, '') then
    raise exception 'not_eligible' using errcode = 'P0001', detail = 'occupation_status';
  end if;
  if exists (
    select 1 from session_question sq
    where sq.session_id = p_session_id and sq.required
      and not (p_answers ? coalesce(sq.question_id::text, sq.id::text))
  ) then
    raise exception 'missing_required_answers' using errcode = 'P0001';
  end if;

  insert into application (session_id, person_id, answers, consent_share)
    values (p_session_id, v_pid, coalesce(p_answers, '{}'::jsonb), p_consent_share)
  on conflict (session_id, person_id) do update
    set status = 'applied', answers = excluded.answers, consent_share = excluded.consent_share,
        decided_by = null, decided_at = null, confirm_by = null, confirmed_at = null, rank = null
    where application.status in ('withdrawn','expired')
  returning id into v_id;
  if v_id is null then
    raise exception 'already_applied' using errcode = '23505';
  end if;
  return v_id;
end $$;

-- === Talent: withdraw_application ==========================================
create or replace function withdraw_application(p_application_id uuid) returns void
  language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid := current_person_id(); v_old text;
begin
  select status into v_old from application where id = p_application_id and person_id = v_pid for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;
  if v_old in ('attended','no_show','declined','expired','withdrawn') then
    raise exception 'cannot_withdraw' using errcode = 'P0001', detail = v_old;
  end if;
  update application set status = 'withdrawn' where id = p_application_id;
end $$;

-- === Talent: confirm_application (Ticketpflicht, Kollision, Frist) =========
create or replace function confirm_application(p_application_id uuid, p_replace_conflicting boolean default false)
returns jsonb
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid   uuid := current_person_id();
  v_a     application%rowtype;
  v_s     session%rowtype;
  v_slot  slot%rowtype;
  v_conf  uuid[];
begin
  select * into v_a from application where id = p_application_id and person_id = v_pid for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;
  if v_a.status not in ('accepted','promoted') then
    raise exception 'not_confirmable' using errcode = 'P0001', detail = v_a.status;
  end if;
  if not decisions_released(v_a.session_id) then
    raise exception 'not_released' using errcode = 'P0001';
  end if;
  if v_a.confirm_by is not null and v_a.confirm_by < now() then
    update application set status = 'expired' where id = p_application_id;
    raise exception 'confirm_deadline_passed' using errcode = 'P0001';
  end if;
  select * into v_s from session where id = v_a.session_id;
  if v_s.ticket_required and not exists (
      select 1 from ticket t where t.event_id = v_s.event_id and t.person_id = v_pid and t.status = 'valid') then
    raise exception 'ticket_required' using errcode = 'P0001';
  end if;

  -- Kollision mit anderen bestätigten Zusagen (zeitgleicher Slot) → Entscheidungszwang
  if v_s.slot_id is not null then
    select * into v_slot from slot where id = v_s.slot_id;
    select array_agg(o.id) into v_conf
    from application o
    join session so on so.id = o.session_id
    join slot sl on sl.id = so.slot_id
    where o.person_id = v_pid and o.status = 'confirmed' and o.id <> p_application_id
      and tstzrange(sl.start_at, sl.end_at, '[)') && tstzrange(v_slot.start_at, v_slot.end_at, '[)');
    if v_conf is not null then
      if not p_replace_conflicting then
        raise exception 'collision' using errcode = 'P0001', detail = array_to_string(v_conf, ',');
      end if;
      update application set status = 'withdrawn' where id = any(v_conf);
    end if;
  end if;

  update application set status = 'confirmed', confirmed_at = now() where id = p_application_id;
  return jsonb_build_object('ok', true, 'replaced', coalesce(to_jsonb(v_conf), '[]'::jsonb));
end $$;

-- === Entscheider: decide_application =======================================
create or replace function decide_application(p_application_id uuid, p_status text, p_rank integer default null)
returns void
  language plpgsql security definer set search_path = public, extensions as $$
declare v_a application%rowtype;
begin
  select * into v_a from application where id = p_application_id for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;
  if not can_decide_session(v_a.session_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('shortlisted','accepted','waitlisted','declined') then
    raise exception 'invalid_decision' using errcode = '22023', detail = p_status;
  end if;
  if v_a.status in ('confirmed','attended','no_show','withdrawn') then
    raise exception 'not_decidable' using errcode = 'P0001', detail = v_a.status;
  end if;
  update application
     set status = p_status, rank = coalesce(p_rank, rank),
         decided_by = current_person_id(), decided_at = now(),
         confirm_by = case when p_status = 'accepted' and decisions_released(v_a.session_id)
                           then now() + make_interval(hours => (select confirm_by_hours from session where id = v_a.session_id))
                           else null end
   where id = p_application_id;
  perform log_audit('application.decide', 'application', p_application_id::text,
                    jsonb_build_object('status', v_a.status), jsonb_build_object('status', p_status, 'rank', p_rank));
end $$;

-- === Programm-Team: release_decisions ======================================
create or replace function release_decisions(p_session_id uuid, p_note text default null) returns integer
  language plpgsql security definer set search_path = public, extensions as $$
declare v_hours integer; v_n integer;
begin
  if not (has_role('admin') or has_role('programme_team') or has_role('area_lead_talent')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select confirm_by_hours into v_hours from session where id = p_session_id;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  insert into decision_release (session_id, released_by, note)
    values (p_session_id, current_person_id(), p_note)
  on conflict (session_id) do nothing;
  update application
     set confirm_by = now() + make_interval(hours => v_hours)
   where session_id = p_session_id and status in ('accepted','promoted') and confirm_by is null;
  get diagnostics v_n = row_count;
  perform log_audit('application.release', 'session', p_session_id::text, null, jsonb_build_object('accepted', v_n));
  return v_n;
end $$;

-- === Nachrücken & Verfall (Cron/Staff) =====================================
create or replace function promote_waitlist(p_session_id uuid, p_count integer default 1) returns integer
  language plpgsql security definer set search_path = public, extensions as $$
declare v_hours integer; v_n integer := 0; r record;
begin
  if not (has_role('admin') or has_role('programme_team') or has_role('area_lead_talent') or auth.uid() is null) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select confirm_by_hours into v_hours from session where id = p_session_id;
  for r in
    select id from application
    where session_id = p_session_id and status = 'waitlisted'
    order by rank nulls last, created_at
    limit p_count
  loop
    update application set status = 'promoted', confirm_by = now() + make_interval(hours => v_hours) where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function expire_overdue_applications() returns integer
  language plpgsql security definer set search_path = public, extensions as $$
declare v_n integer;
begin
  if not (auth.uid() is null or has_role('admin') or has_role('programme_team')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update application set status = 'expired'
   where status in ('accepted','promoted') and confirm_by is not null and confirm_by < now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- === Talent: register_for_session / cancel_registration ====================
create or replace function register_for_session(p_session_id uuid) returns text
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid uuid := current_person_id();
  v_s   session%rowtype;
  v_n   integer;
  v_status text;
begin
  if v_pid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_s from session where id = p_session_id for update;
  if not found or v_s.publish_status <> 'published' then
    raise exception 'session_not_open' using errcode = 'P0002';
  end if;
  if v_s.access_mode <> 'registration' then
    raise exception 'session_not_registration' using errcode = '22023';
  end if;
  if v_s.application_deadline is not null and v_s.application_deadline < now() then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;
  if v_s.ticket_required and not exists (
      select 1 from ticket t where t.event_id = v_s.event_id and t.person_id = v_pid and t.status = 'valid') then
    raise exception 'ticket_required' using errcode = 'P0001';
  end if;
  select count(*) into v_n from registration where session_id = p_session_id and status = 'confirmed';
  v_status := case when v_s.capacity is null or v_n < v_s.capacity then 'confirmed' else 'waitlisted' end;

  insert into registration (person_id, event_id, session_id, status, source, registered_at)
    values (v_pid, v_s.event_id, p_session_id, v_status, 'portal', now())
  on conflict (person_id, session_id) where session_id is not null do update
    set status = case when registration.status in ('cancelled','declined','no_response') then excluded.status
                      else registration.status end,
        registered_at = case when registration.status in ('cancelled','declined','no_response') then now()
                             else registration.registered_at end;
  return v_status;
end $$;

create or replace function cancel_registration(p_session_id uuid) returns void
  language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid := current_person_id();
begin
  update registration set status = 'cancelled'
   where person_id = v_pid and session_id = p_session_id and status in ('confirmed','waitlisted','applied');
  if not found then
    raise exception 'registration_not_found' using errcode = 'P0002';
  end if;
end $$;

-- === Talent: personalize_ticket ============================================
-- Käufer oder aktueller Inhaber personalisiert: für sich selbst (p_for_me) oder für eine
-- andere Person (holder_email). Verknüpfung mit deren person erfolgt beim Login (Claim, Welle 1).
create or replace function personalize_ticket(
  p_ticket_id uuid, p_first_name text, p_last_name text, p_company text, p_position text,
  p_for_me boolean default true, p_holder_email text default null
) returns void
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid   uuid   := current_person_id();
  v_email citext := auth.email();
  v_t     ticket%rowtype;
  v_complete boolean;
begin
  if v_pid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_t from ticket where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket_not_found' using errcode = 'P0002';
  end if;
  if not (v_t.person_id = v_pid or v_t.buyer_email = v_email or v_t.holder_email = v_email) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_t.status <> 'valid' then
    raise exception 'ticket_not_valid' using errcode = 'P0001', detail = v_t.status;
  end if;
  if not p_for_me and (p_holder_email is null or position('@' in p_holder_email) = 0) then
    raise exception 'holder_email_required' using errcode = '22023';
  end if;
  v_complete := coalesce(p_first_name, '') <> '' and coalesce(p_last_name, '') <> ''
                and coalesce(p_company, '') <> '' and coalesce(p_position, '') <> '';
  update ticket
     set holder_first_name = p_first_name, holder_last_name = p_last_name,
         holder_company = p_company, holder_position = p_position,
         person_id    = case when p_for_me then v_pid else null end,
         holder_email = case when p_for_me then v_email else lower(trim(p_holder_email))::citext end,
         personalization_status = case when v_complete then 'complete' else 'partial' end,
         personalized_at = now()
   where id = p_ticket_id;
  perform log_audit('ticket.personalize', 'ticket', p_ticket_id::text, null,
                    jsonb_build_object('for_me', p_for_me, 'complete', v_complete));
end $$;

-- === RLS ====================================================================
alter table question_catalog      enable row level security;
alter table session_question      enable row level security;
alter table application           enable row level security;
alter table decision_release      enable row level security;
alter table ticket_type_map       enable row level security;
alter table ticket                enable row level security;
alter table org_ticket_allocation enable row level security;
alter table checkin               enable row level security;

drop policy if exists qc_read on question_catalog;
create policy qc_read on question_catalog for select to authenticated using (true);

drop policy if exists sq_read on session_question;
create policy sq_read on session_question for select to authenticated using (is_session_visible(session_id));

drop policy if exists app_self_sel on application;
create policy app_self_sel on application for select to authenticated using (person_id = current_person_id());

drop policy if exists dr_read on decision_release;
create policy dr_read on decision_release for select to authenticated using (true);

-- ticket_type_map: nur service_role (Rechte-Mapping intern)
drop policy if exists ticket_self_sel on ticket;
create policy ticket_self_sel on ticket for select to authenticated
  using (person_id = current_person_id() or holder_email = auth.email() or buyer_email = auth.email());

drop policy if exists ota_member_sel on org_ticket_allocation;
create policy ota_member_sel on org_ticket_allocation for select to authenticated using (is_member_of_org(org_id));

drop policy if exists checkin_self_sel on checkin;
create policy checkin_self_sel on checkin for select to authenticated
  using (exists (select 1 from ticket t where t.id = checkin.ticket_id and t.person_id = current_person_id()));

-- === GRANTs =================================================================
grant all on question_catalog, session_question, application, decision_release, ticket_type_map,
             ticket, org_ticket_allocation, checkin to service_role;
grant usage, select on all sequences in schema public to service_role;

grant select on question_catalog, session_question, decision_release, org_ticket_allocation, checkin to authenticated;
-- application: Entscheidungsfelder nur über my_applications()
grant select (id, session_id, person_id, answers, consent_share, confirm_by, confirmed_at, created_at, updated_at)
  on application to authenticated;
grant select (id, event_id, person_id, pass_type, barcode, vivenu_ticket_id, vivenu_transaction_id, buyer_email,
              holder_email, holder_first_name, holder_last_name, holder_company, holder_position, status,
              personalization_status, addons, source, purchased_at, personalized_at, checked_in_at, created_at)
  on ticket to authenticated;

grant execute on function is_member_of_org(uuid)                                            to authenticated;
grant execute on function can_decide_session(uuid)                                          to authenticated;
grant execute on function decisions_released(uuid)                                          to authenticated;
grant execute on function my_applications()                                                 to authenticated;
grant execute on function apply_to_session(uuid, jsonb, boolean)                            to authenticated;
grant execute on function withdraw_application(uuid)                                        to authenticated;
grant execute on function confirm_application(uuid, boolean)                                to authenticated;
grant execute on function decide_application(uuid, text, integer)                           to authenticated;
grant execute on function release_decisions(uuid, text)                                     to authenticated;
grant execute on function promote_waitlist(uuid, integer)                                   to authenticated, service_role;
grant execute on function expire_overdue_applications()                                     to authenticated, service_role;
grant execute on function register_for_session(uuid)                                        to authenticated;
grant execute on function cancel_registration(uuid)                                         to authenticated;
grant execute on function personalize_ticket(uuid, text, text, text, text, boolean, text)   to authenticated;
revoke execute on function session_question_limit() from public, anon, authenticated;
