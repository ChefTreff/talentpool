-- =============================================================================
-- 0007 · v2 Edition & Programm
--   event erweitert (Edition) · event_day · stage · stage_day · track · slot
--   (Exclusion gegen Überlappung je Bühne) · session · session_speaker ·
--   slot_history · Rechte-Helper can_edit_stage/can_edit_slot · RPCs create_slot,
--   move_slot, set_slot_status · Views programme_public, stage_day_slot_stats
-- Zeitlogik (Frage 73): 5-Min-Raster, Wechselzeit/Standarddauer je Bühne als
-- Parameter -> Warnungen; nur Überlappung auf derselben Bühne wird hart verhindert.
-- =============================================================================
set search_path = public, extensions;

-- === event: Edition-Klammer =================================================
alter table event
  add column if not exists slug       text,
  add column if not exists is_edition boolean not null default false,
  add column if not exists edition_id uuid references event (id) on delete set null,
  add column if not exists timezone   text not null default 'Europe/Berlin',
  add column if not exists venue      text,
  add column if not exists status     text not null default 'planning';
alter table event drop constraint if exists event_status_chk;
alter table event add constraint event_status_chk check (status in ('planning','published','running','archived'));
create unique index if not exists event_slug_uidx   on event (slug) where slug is not null;
create index        if not exists event_edition_idx on event (edition_id);
comment on table  event            is 'Format/Termin (Summit, Hackathon, Side-Event, Community). is_edition = Klammer wie FLS27-Woche; Kinder verweisen über edition_id.';
comment on column event.edition_id is 'Edition, zu der dieses Event gehört (Rollen sind edition-gebunden).';

-- === event_day ==============================================================
create table if not exists event_day (
  id              uuid        primary key default gen_random_uuid(),
  event_id        uuid        not null references event (id) on delete cascade,
  day_date        date        not null,
  label_de        text,
  label_en        text,
  doors_open      time,
  programme_start time,
  programme_end   time,
  sort_order      integer     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (event_id, day_date)
);
drop trigger if exists trg_event_day_updated on event_day;
create trigger trg_event_day_updated before update on event_day for each row execute function set_updated_at();
comment on table event_day is 'Veranstaltungstag eines Events (Einlass, Programmbeginn/-ende).';

-- === stage ==================================================================
create table if not exists stage (
  id                   uuid        primary key default gen_random_uuid(),
  event_id             uuid        not null references event (id) on delete cascade,
  name                 text        not null,
  slug                 text,
  type                 text        not null default 'side'
                       check (type in ('main','side','partner_booth','room')),   -- vocab stage_type
  room                 text,
  capacity             integer,
  partner_org_id       uuid        references organization (id) on delete set null,
  stage_lead_person_id uuid        references person (id) on delete set null,
  changeover_min       integer     not null default 0  check (changeover_min >= 0),
  default_duration_min integer     not null default 30 check (default_duration_min > 0),
  partner_slot_quota   integer,
  sort_order           integer     not null default 0,
  active               boolean     not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (event_id, slug)
);
create index if not exists stage_event_idx on stage (event_id, sort_order);
drop trigger if exists trg_stage_updated on stage;
create trigger trg_stage_updated before update on stage for each row execute function set_updated_at();
comment on table  stage                      is 'Bühne oder Raum eines Events. Parameter (Wechselzeit, Standarddauer, Kontingent) steuern das Programm-Board.';
comment on column stage.partner_org_id       is 'Partnerbühne: Organisation, die ihre Spalte selbst pflegt (Rolle standbuehne_editor).';
comment on column stage.partner_slot_quota   is 'Kontingent verkaufter Partner-Slots auf dieser Bühne (Zähler im Board).';

-- === stage_day ==============================================================
create table if not exists stage_day (
  id           uuid        primary key default gen_random_uuid(),
  stage_id     uuid        not null references stage (id) on delete cascade,
  event_day_id uuid        not null references event_day (id) on delete cascade,
  open_from    time,
  open_to      time,
  slot_quota   integer,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (stage_id, event_day_id)
);
drop trigger if exists trg_stage_day_updated on stage_day;
create trigger trg_stage_day_updated before update on stage_day for each row execute function set_updated_at();
comment on table stage_day is 'Bühne × Tag: Öffnungszeiten und Slot-Kontingent (allgemeine Slot-Logik, Antwort 74).';

-- === track ==================================================================
create table if not exists track (
  id         uuid        primary key default gen_random_uuid(),
  event_id   uuid        not null references event (id) on delete cascade,
  name_de    text        not null,
  name_en    text,
  slug       text,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, slug)
);
comment on table track is 'Thematischer Track (Swapcard-Track).';

-- === slot ===================================================================
create table if not exists slot (
  id                    uuid        primary key default gen_random_uuid(),
  stage_id              uuid        not null references stage (id) on delete cascade,
  event_day_id          uuid        not null references event_day (id) on delete cascade,
  start_at              timestamptz not null,
  end_at                timestamptz not null,
  slot_type             text        not null default 'content'
                        check (slot_type in ('content','fixed_block','placeholder','partner_block','frame')),
  status                text        not null default 'open',          -- vocab slot_status
  sort_order            integer     not null default 0,
  source_ref            text,                                          -- Herkunft (Backlog-Zeile, Partnerslot)
  responsible_person_id uuid        references person (id) on delete set null,
  internal_title        text,                                          -- nur Regie/Programm
  internal_notes        text,                                          -- nur Regie/Programm
  created_by            uuid        references person (id) on delete set null,
  updated_by            uuid        references person (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint slot_time_chk check (end_at > start_at),
  -- Harte Regel: keine Überlappung auf derselben Bühne (Rahmenblöcke wie Einlass/Ende ausgenommen)
  constraint slot_no_overlap exclude using gist (
    stage_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (slot_type <> 'frame')
);
create index if not exists slot_stage_day_idx on slot (stage_id, event_day_id, start_at);
create index if not exists slot_day_idx       on slot (event_day_id, start_at);
drop trigger if exists trg_slot_updated on slot;
create trigger trg_slot_updated before update on slot for each row execute function set_updated_at();
comment on table  slot                is 'Zeitfenster auf einer Bühne. Genau eine Session kann darauf liegen. Farbe im Board = status.';
comment on column slot.internal_title is 'Interner Titel für Regie/Programm-Team, nie öffentlich.';

create or replace function slot_consistency_check() returns trigger
language plpgsql as $$
declare v_ev uuid; v_ev2 uuid;
begin
  select event_id into v_ev  from stage     where id = new.stage_id;
  select event_id into v_ev2 from event_day where id = new.event_day_id;
  if v_ev is distinct from v_ev2 then
    raise exception 'slot: stage and event_day belong to different events' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_slot_consistency on slot;
create trigger trg_slot_consistency before insert or update on slot
  for each row execute function slot_consistency_check();

-- === session ================================================================
create table if not exists session (
  id                   uuid        primary key default gen_random_uuid(),
  event_id             uuid        not null references event (id) on delete cascade,
  slot_id              uuid        unique references slot (id) on delete set null,   -- null = Backlog
  format               text        not null default 'keynote',                        -- vocab session_format
  title_de             text,
  title_en             text,
  description_de       text,
  description_en       text,
  language             text        not null default 'de' check (language in ('de','en','mixed')),
  access_mode          text        not null default 'open'
                       check (access_mode in ('open','registration','application')),
  eligibility_rule     jsonb,
  capacity             integer,
  ticket_required      boolean     not null default true,
  application_deadline timestamptz,
  confirm_by_hours     integer     not null default 72,
  host_org_id          uuid        references organization (id) on delete set null,
  track_id             uuid        references track (id) on delete set null,
  moderation_person_id uuid        references person (id) on delete set null,
  publish_status       text        not null default 'draft'
                       check (publish_status in ('draft','review','published','cancelled')),
  tags                 text[]      not null default '{}',
  swapcard_id          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint session_title_chk check (title_de is not null or title_en is not null)
);
create index if not exists session_event_idx on session (event_id, publish_status);
create index if not exists session_slot_idx  on session (slot_id);
drop trigger if exists trg_session_updated on session;
create trigger trg_session_updated before update on session for each row execute function set_updated_at();
comment on table  session                is 'Programmpunkt (öffentliche Felder für App/Website/Swapcard). Interne Regie-Werte liegen in regie_cue (Welle 4).';
comment on column session.access_mode    is 'open = einfach hingehen · registration = anmelden · application = bewerben (Pipeline).';
comment on column session.eligibility_rule is 'JSON-Regel für Bewerbungsberechtigung (z. B. {"tier":"talent","u35":true}).';

-- Pflichtfelder gelten erst beim Veröffentlichen (Antwort 76): Bühne/Raum, Titel DE+EN, Beschreibung
create or replace function session_publish_check() returns trigger
language plpgsql as $$
begin
  if new.publish_status = 'published' then
    if new.slot_id is null then
      raise exception 'publish requires a slot (stage/room)' using errcode = '23514';
    end if;
    if new.title_de is null or new.title_en is null then
      raise exception 'publish requires title_de and title_en' using errcode = '23514';
    end if;
    if coalesce(new.description_de, new.description_en) is null then
      raise exception 'publish requires a description' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_session_publish on session;
create trigger trg_session_publish before insert or update on session
  for each row execute function session_publish_check();

-- === session_speaker ========================================================
create table if not exists session_speaker (
  session_id uuid        not null references session (id) on delete cascade,
  person_id  uuid        not null references person (id) on delete cascade,
  role       text        not null default 'speaker' check (role in ('speaker','moderator','host','panelist')),
  sort_order integer     not null default 0,
  confirmed  boolean     not null default false,
  created_at timestamptz not null default now(),
  primary key (session_id, person_id, role)
);
create index if not exists session_speaker_person_idx on session_speaker (person_id);
comment on table session_speaker is 'Speaker/Moderation/Host je Session.';

-- === slot_history ===========================================================
create table if not exists slot_history (
  id         bigint      generated always as identity primary key,
  slot_id    uuid        not null references slot (id) on delete cascade,
  changed_by uuid        references person (id) on delete set null,
  changed_at timestamptz not null default now(),
  action     text        not null,             -- create · move · status · delete
  before     jsonb,
  after      jsonb,
  reason     text
);
create index if not exists slot_history_slot_idx on slot_history (slot_id, changed_at desc);
comment on table slot_history is 'Änderungslog des Programm-Boards (Verschiebungen nach Veröffentlichung sichtbar).';

-- === Rechte-Helper (SECURITY DEFINER, umgehen RLS gezielt) ==================
create or replace function active_roles()
returns table (role text, scope_type text, scope_id uuid, edition_id uuid)
  language sql stable security definer set search_path = public, extensions as $$
  select role, scope_type, scope_id, edition_id
  from role_assignment
  where person_id = current_person_id()
    and valid_from <= now() and (valid_to is null or valid_to > now())
$$;
revoke execute on function active_roles() from public, anon, authenticated;

create or replace function can_edit_stage(p_stage_id uuid) returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1
    from stage st
    join event ev on ev.id = st.event_id
    join active_roles() ra on true
    where st.id = p_stage_id
      and (
           (ra.role in ('admin','programme_team') and ra.scope_type = 'global')
        or (ra.role in ('admin','programme_team') and ra.scope_type = 'edition'
            and ra.edition_id in (ev.id, ev.edition_id))
        or (ra.role in ('speaker_manager','standbuehne_editor') and ra.scope_type = 'stage'
            and ra.scope_id = st.id)
      )
  )
$$;

create or replace function can_edit_slot(p_slot_id uuid) returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1
    from slot s
    join stage st on st.id = s.stage_id
    join event ev on ev.id = st.event_id
    left join stage_day sd on sd.stage_id = s.stage_id and sd.event_day_id = s.event_day_id
    join active_roles() ra on true
    where s.id = p_slot_id
      and (
           (ra.role in ('admin','programme_team') and ra.scope_type = 'global')
        or (ra.role in ('admin','programme_team') and ra.scope_type = 'edition'
            and ra.edition_id in (ev.id, ev.edition_id))
        or (ra.role in ('speaker_manager','standbuehne_editor') and ra.scope_type = 'stage'
            and ra.scope_id = s.stage_id)
        or (ra.role = 'speaker_manager' and ra.scope_type = 'stage_day' and ra.scope_id = sd.id)
        or (ra.role = 'speaker_manager' and ra.scope_type = 'slot'      and ra.scope_id = s.id)
      )
  )
$$;

create or replace function is_programme_reader() returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select is_staff() or has_role('speaker_manager') or has_role('standbuehne_editor')
$$;

create or replace function is_speaker_of(p_session_id uuid) returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from session_speaker ss
                 where ss.session_id = p_session_id and ss.person_id = current_person_id())
$$;

create or replace function is_session_visible(p_session_id uuid) returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select is_programme_reader()
      or is_speaker_of(p_session_id)
      or exists (select 1 from session se where se.id = p_session_id and se.publish_status = 'published')
$$;

create or replace function slot_has_published_session(p_slot_id uuid) returns boolean
  language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from session se where se.slot_id = p_slot_id and se.publish_status = 'published')
$$;

-- === RPC: create_slot =======================================================
create or replace function create_slot(
  p_stage_id uuid, p_start timestamptz, p_end timestamptz,
  p_slot_type text default 'content', p_session_id uuid default null, p_source_ref text default null
) returns uuid
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_stage stage%rowtype;
  v_tz    text;
  v_day   event_day%rowtype;
  v_id    uuid;
begin
  if not can_edit_stage(p_stage_id) then
    raise exception 'not allowed on this stage' using errcode = '42501';
  end if;
  if p_end <= p_start then
    raise exception 'end must be after start' using errcode = '22023';
  end if;
  select * into v_stage from stage where id = p_stage_id;
  select timezone into v_tz from event where id = v_stage.event_id;
  select * into v_day from event_day
    where event_id = v_stage.event_id and day_date = (p_start at time zone v_tz)::date;
  if not found then
    raise exception 'no event day for % on this stage', p_start using errcode = '22023';
  end if;
  insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, source_ref, created_by, updated_by)
    values (p_stage_id, v_day.id, p_start, p_end, p_slot_type, p_source_ref, current_person_id(), current_person_id())
    returning id into v_id;
  if p_session_id is not null then
    update session set slot_id = v_id
      where id = p_session_id and slot_id is null and event_id = v_stage.event_id;
    if not found then
      raise exception 'session not attachable (already placed or other event)' using errcode = '22023';
    end if;
  end if;
  insert into slot_history (slot_id, changed_by, action, after)
    values (v_id, current_person_id(), 'create',
            jsonb_build_object('stage_id', p_stage_id, 'start_at', p_start, 'end_at', p_end, 'session_id', p_session_id));
  perform log_audit('slot.create', 'slot', v_id::text, null,
                    jsonb_build_object('stage_id', p_stage_id, 'start_at', p_start, 'end_at', p_end));
  return v_id;
end $$;

-- === RPC: move_slot (Drag & Drop / Resize) ==================================
-- Rückgabe: {ok:true, warnings:[...]} — Warnungen blockieren nicht (Antwort 73).
-- Überlappung auf derselben Bühne wirft exclusion_violation (23P01).
-- Veröffentlichte Sessions: nur mit p_confirm = true (Bestätigung + Log).
create or replace function move_slot(
  p_slot_id uuid, p_stage_id uuid, p_start timestamptz, p_end timestamptz, p_confirm boolean default false
) returns jsonb
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_slot      slot%rowtype;
  v_stage     stage%rowtype;
  v_tz        text;
  v_day       event_day%rowtype;
  v_sd        stage_day%rowtype;
  v_warn      text[] := '{}';
  v_published boolean;
  v_before    jsonb;
  v_after     jsonb;
begin
  select * into v_slot from slot where id = p_slot_id for update;
  if not found then
    raise exception 'slot not found' using errcode = 'P0002';
  end if;
  if not can_edit_slot(p_slot_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_end <= p_start then
    raise exception 'end must be after start' using errcode = '22023';
  end if;
  if v_slot.slot_type in ('fixed_block','frame') and not (is_admin() or has_role('programme_team')) then
    raise exception 'fixed blocks can only be moved by the programme team' using errcode = '42501';
  end if;
  if p_stage_id <> v_slot.stage_id and not can_edit_stage(p_stage_id) then
    raise exception 'not allowed on target stage' using errcode = '42501';
  end if;

  select * into v_stage from stage where id = p_stage_id;
  if not found then
    raise exception 'stage not found' using errcode = 'P0002';
  end if;
  select timezone into v_tz from event where id = v_stage.event_id;
  select * into v_day from event_day
    where event_id = v_stage.event_id and day_date = (p_start at time zone v_tz)::date;
  if not found then
    raise exception 'no event day for % on this stage', p_start using errcode = '22023';
  end if;

  select exists (select 1 from session se where se.slot_id = p_slot_id and se.publish_status = 'published')
    into v_published;
  if v_published and not p_confirm then
    raise exception 'confirmation_required'
      using errcode = 'P0001', hint = 'Slot ist veröffentlicht. Verschieben nur mit Bestätigung.';
  end if;

  -- Warnungen (nicht blockierend)
  select * into v_sd from stage_day where stage_id = p_stage_id and event_day_id = v_day.id;
  if found then
    if v_sd.open_from is not null and (p_start at time zone v_tz)::time < v_sd.open_from then
      v_warn := array_append(v_warn, 'before_open');
    end if;
    if v_sd.open_to is not null and (p_end at time zone v_tz)::time > v_sd.open_to then
      v_warn := array_append(v_warn, 'after_close');
    end if;
  end if;
  if extract(epoch from p_start)::bigint % 300 <> 0 or extract(epoch from p_end)::bigint % 300 <> 0 then
    v_warn := array_append(v_warn, 'off_grid_5min');
  end if;
  if v_stage.changeover_min > 0 and exists (
      select 1 from slot o
      where o.stage_id = p_stage_id and o.id <> p_slot_id and o.slot_type <> 'frame'
        and (
             (o.start_at >= p_end   and o.start_at <  p_end   + make_interval(mins => v_stage.changeover_min))
          or (o.end_at   <= p_start and o.end_at   >  p_start - make_interval(mins => v_stage.changeover_min))
        )
  ) then
    v_warn := array_append(v_warn, 'changeover_short');
  end if;
  if exists (
    select 1
    from session se
    join session_speaker ss on ss.session_id = se.id
    where se.slot_id = p_slot_id
      and exists (
        select 1
        from session_speaker ss2
        join session se2 on se2.id = ss2.session_id
        join slot sl2 on sl2.id = se2.slot_id
        where ss2.person_id = ss.person_id and se2.id <> se.id
          and tstzrange(sl2.start_at, sl2.end_at, '[)') && tstzrange(p_start, p_end, '[)')
      )
  ) then
    v_warn := array_append(v_warn, 'speaker_conflict');
  end if;

  v_before := jsonb_build_object('stage_id', v_slot.stage_id, 'event_day_id', v_slot.event_day_id,
                                 'start_at', v_slot.start_at, 'end_at', v_slot.end_at);
  v_after  := jsonb_build_object('stage_id', p_stage_id, 'event_day_id', v_day.id,
                                 'start_at', p_start, 'end_at', p_end);

  update slot
     set stage_id = p_stage_id, event_day_id = v_day.id, start_at = p_start, end_at = p_end,
         updated_by = current_person_id()
   where id = p_slot_id;

  insert into slot_history (slot_id, changed_by, action, before, after, reason)
    values (p_slot_id, current_person_id(), 'move', v_before, v_after,
            case when v_published then 'confirmed_after_publish' end);
  perform log_audit('slot.move', 'slot', p_slot_id::text, v_before, v_after);

  return jsonb_build_object('ok', true, 'warnings', to_jsonb(v_warn));
end $$;

-- === RPC: set_slot_status ===================================================
create or replace function set_slot_status(p_slot_id uuid, p_status text) returns void
  language plpgsql security definer set search_path = public, extensions as $$
declare v_old text;
begin
  if not can_edit_slot(p_slot_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from vocab_term where vocabulary = 'slot_status' and key = p_status and active) then
    raise exception 'unknown slot status %', p_status using errcode = '22023';
  end if;
  select status into v_old from slot where id = p_slot_id for update;
  update slot set status = p_status, updated_by = current_person_id() where id = p_slot_id;
  insert into slot_history (slot_id, changed_by, action, before, after)
    values (p_slot_id, current_person_id(), 'status',
            jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
end $$;

-- === Views ==================================================================
create or replace view programme_public with (security_invoker = true) as
  select se.id as session_id, se.event_id, se.format, se.title_de, se.title_en,
         se.description_de, se.description_en, se.language, se.access_mode, se.capacity,
         se.ticket_required, se.application_deadline, se.track_id, se.tags, se.host_org_id,
         sl.id as slot_id, sl.start_at, sl.end_at,
         st.id as stage_id, st.name as stage_name, st.room,
         ed.id as event_day_id, ed.day_date
  from session se
  join slot      sl on sl.id = se.slot_id
  join stage     st on st.id = sl.stage_id
  join event_day ed on ed.id = sl.event_day_id
  where se.publish_status = 'published';
comment on view programme_public is 'Veröffentlichtes Programm (Talent-Portal, Swapcard-Sync).';

create or replace view stage_day_slot_stats with (security_invoker = true) as
  select sd.id as stage_day_id, sd.stage_id, sd.event_day_id, sd.slot_quota,
         count(sl.id) filter (where sl.slot_type in ('content','partner_block','placeholder')) as slots_used,
         count(sl.id) filter (where sl.slot_type = 'placeholder')                               as slots_placeholder,
         sd.slot_quota - count(sl.id) filter (where sl.slot_type in ('content','partner_block','placeholder')) as slots_available
  from stage_day sd
  left join slot sl on sl.stage_id = sd.stage_id and sl.event_day_id = sd.event_day_id
  group by sd.id;
comment on view stage_day_slot_stats is 'Verfügbare/belegte Slots je Bühne × Tag (Board-Kopfzeile, Antwort 74).';

-- === RLS ====================================================================
alter table event_day       enable row level security;
alter table stage           enable row level security;
alter table stage_day       enable row level security;
alter table track           enable row level security;
alter table slot            enable row level security;
alter table session         enable row level security;
alter table session_speaker enable row level security;
alter table slot_history    enable row level security;

drop policy if exists event_day_read on event_day;
create policy event_day_read on event_day for select to authenticated using (true);
drop policy if exists stage_read on stage;
create policy stage_read on stage for select to authenticated using (true);
drop policy if exists stage_day_read on stage_day;
create policy stage_day_read on stage_day for select to authenticated using (true);
drop policy if exists track_read on track;
create policy track_read on track for select to authenticated using (true);

-- Slots: Rahmen und veröffentlichte Slots für alle; Planungsstand nur für Programm-Leser
drop policy if exists slot_read on slot;
create policy slot_read on slot for select to authenticated
  using (slot_type = 'frame' or is_programme_reader() or slot_has_published_session(id));

drop policy if exists session_read on session;
create policy session_read on session for select to authenticated
  using (publish_status = 'published' or is_programme_reader() or is_speaker_of(id));

drop policy if exists session_speaker_read on session_speaker;
create policy session_speaker_read on session_speaker for select to authenticated
  using (is_session_visible(session_id));

drop policy if exists slot_history_read on slot_history;
create policy slot_history_read on slot_history for select to authenticated
  using (is_programme_reader());
-- Schreiben: ausschließlich RPCs (security definer) und service_role.

-- === GRANTs =================================================================
grant all on event_day, stage, stage_day, track, slot, session, session_speaker, slot_history,
             programme_public, stage_day_slot_stats to service_role;
grant usage, select on all sequences in schema public to service_role;

grant select on event_day, stage_day, track, session, session_speaker, slot_history,
                programme_public, stage_day_slot_stats to authenticated;
-- Spalten-Whitelist: interne Felder bleiben unsichtbar
grant select (id, event_id, name, slug, type, room, capacity, partner_org_id, changeover_min,
              default_duration_min, partner_slot_quota, sort_order, active, created_at, updated_at)
  on stage to authenticated;
grant select (id, stage_id, event_day_id, start_at, end_at, slot_type, status, sort_order, created_at, updated_at)
  on slot to authenticated;

grant execute on function can_edit_stage(uuid)                                            to authenticated;
grant execute on function can_edit_slot(uuid)                                             to authenticated;
grant execute on function is_programme_reader()                                           to authenticated;
grant execute on function is_speaker_of(uuid)                                             to authenticated;
grant execute on function is_session_visible(uuid)                                        to authenticated;
grant execute on function slot_has_published_session(uuid)                                to authenticated;
grant execute on function create_slot(uuid, timestamptz, timestamptz, text, uuid, text)   to authenticated;
grant execute on function move_slot(uuid, uuid, timestamptz, timestamptz, boolean)        to authenticated;
grant execute on function set_slot_status(uuid, text)                                     to authenticated;
revoke execute on function slot_consistency_check() from public, anon, authenticated;
revoke execute on function session_publish_check()  from public, anon, authenticated;
