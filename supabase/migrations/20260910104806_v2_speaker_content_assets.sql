-- =============================================================================
-- 0028 · v2 Speaker: Session-Inhalte „eingereicht vs. final" (Welle 2 A3) +
--        Uploads, Deadlines, Technik-Check, Slid@Home (A4)
--   A3: session_submission, is_speaker_side_of(), my_sessions(), submit_session_content(),
--       approve_session_content() (kopiert nach session), reject_session_content(), pending_submissions()
--   A4: Tabelle deadline (+ Seed presentation_upload FLS27), Storage-Bucket speaker-assets (privat,
--       Pfad <edition>/<profile>/<kind>/<datei>, Policies über speaker_asset_path_allowed()),
--       speaker_asset (Versionen, late statt Sperre, Technik-Check, Slid@Home nur mit Consent),
--       register_speaker_asset(), presentation_window(), set_slides_release(), set_tech_check(),
--       my_speaker_assets(); speaker_next_steps um Inhalt/Präsentation/Foto ergänzt.
-- Entscheidung Konrad 10.09.: nach der Deadline werden Präsentationen weiter angenommen (late = true).
-- =============================================================================
set search_path = public, extensions;

-- Speaker oder dessen Assistenz für eine Session
create or replace function is_speaker_side_of(p_session_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from session_speaker ss
    where ss.session_id = p_session_id
      and (ss.person_id = current_person_id()
           or exists (select 1 from speaker_profile sp where sp.person_id = ss.person_id and sp.assistant_person_id = current_person_id()))
  )
$$;

-- === A3 · session_submission ===================================================
create table if not exists session_submission (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references session (id) on delete cascade,
  speaker_profile_id uuid references speaker_profile (id) on delete set null,
  submitted_by       uuid references person (id) on delete set null,
  title              text,
  description        text,
  topics             text[] not null default '{}',
  language           text,                                   -- de / en / mixed
  notes              text,                                   -- Hinweise an das Team
  status             text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'superseded')),
  reviewed_by        uuid references person (id) on delete set null,
  reviewed_at        timestamptz,
  review_note        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists session_submission_session_idx on session_submission (session_id, status, created_at desc);
comment on table session_submission is 'Vom Speaker eingereichte Session-Inhalte; final steht in session (Freigabe kopiert).';
drop trigger if exists trg_session_submission_updated on session_submission;
create trigger trg_session_submission_updated before update on session_submission for each row execute function set_updated_at();
alter table session_submission enable row level security;
drop policy if exists ssub_read on session_submission;
create policy ssub_read on session_submission for select to authenticated using (is_speaker_side_of(session_id) or can_edit_session(session_id));
revoke all on session_submission from anon;
revoke insert, update, delete on session_submission from authenticated;
grant select on session_submission to authenticated;
grant all on session_submission to service_role;

create or replace function my_sessions()
returns table (
  session_id uuid, event_id uuid, event_name text, title_de text, title_en text, description_de text, description_en text,
  language text, format text, access_mode text, publish_status text, speaker_role text, confirmed boolean,
  start_at timestamptz, end_at timestamptz, stage_name text, room text, timezone text,
  co_speakers jsonb, latest_submission jsonb, on_behalf_of jsonb
)
language sql stable security definer set search_path = public, extensions as $$
  select se.id, se.event_id, e.name, se.title_de, se.title_en, se.description_de, se.description_en,
         se.language, se.format, se.access_mode, se.publish_status, ss.role, ss.confirmed,
         sl.start_at, sl.end_at, st.name, st.room, e.timezone,
         coalesce((select jsonb_agg(jsonb_build_object('person_id', p2.id, 'first_name', p2.first_name, 'last_name', p2.last_name, 'role', ss2.role) order by ss2.sort_order)
                   from session_speaker ss2 join person p2 on p2.id = ss2.person_id
                   where ss2.session_id = se.id and ss2.person_id <> ss.person_id), '[]'::jsonb),
         (select to_jsonb(sub) from (
            select s.id, s.title, s.description, s.topics, s.language, s.notes, s.status, s.review_note, s.created_at, s.reviewed_at
            from session_submission s where s.session_id = se.id order by s.created_at desc limit 1) sub),
         case when sp.person_id <> current_person_id()
              then jsonb_build_object('person_id', sp.person_id, 'first_name', p.first_name, 'last_name', p.last_name) end
  from speaker_profile sp
  join person p on p.id = sp.person_id
  join session_speaker ss on ss.person_id = sp.person_id
  join session se on se.id = ss.session_id
  join event e on e.id = se.event_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)
  left join slot sl on sl.id = se.slot_id
  left join stage st on st.id = sl.stage_id
  where sp.person_id = current_person_id() or sp.assistant_person_id = current_person_id()
  order by sl.start_at nulls last, se.title_de
$$;

create or replace function submit_session_content(p_session_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_sp uuid; v_id uuid; v_lang text := nullif(p_data->>'language', '');
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not is_speaker_side_of(p_session_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_lang is not null and v_lang not in ('de', 'en', 'mixed') then raise exception 'invalid_language' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_data->>'title', '')), '') is null then raise exception 'title_required' using errcode = '22023'; end if;
  select sp.id into v_sp
    from speaker_profile sp
    join session_speaker ss on ss.person_id = sp.person_id and ss.session_id = p_session_id
    join session se on se.id = p_session_id
    join event e on e.id = se.event_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)
   where sp.person_id = v_me or sp.assistant_person_id = v_me
   order by (sp.person_id = v_me) desc limit 1;
  update session_submission set status = 'superseded' where session_id = p_session_id and status = 'submitted';
  insert into session_submission (session_id, speaker_profile_id, submitted_by, title, description, topics, language, notes)
  values (p_session_id, v_sp, v_me, btrim(p_data->>'title'), nullif(btrim(p_data->>'description'), ''),
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_data->'topics', '[]'::jsonb)) x), '{}'),
          v_lang, nullif(btrim(p_data->>'notes'), ''))
  returning id into v_id;
  perform log_audit('session.submission', 'session', p_session_id::text, null, jsonb_build_object('submission_id', v_id, 'speaker_profile_id', v_sp));
  return v_id;
end $$;

-- Freigabe kopiert die finale Fassung nach session; Sprache der Einreichung entscheidet über DE/EN, Overrides gewinnen.
create or replace function approve_session_content(p_submission_id uuid, p_overrides jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_s session_submission%rowtype; v_lang text;
begin
  select * into v_s from session_submission where id = p_submission_id for update;
  if not found then raise exception 'submission_not_found' using errcode = 'P0002'; end if;
  if not can_edit_session(v_s.session_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_s.status <> 'submitted' then raise exception 'not_pending' using errcode = 'P0001', detail = v_s.status; end if;
  v_lang := coalesce(nullif(p_overrides->>'language', ''), v_s.language);
  update session set
    title_de       = coalesce(nullif(btrim(p_overrides->>'title_de'), ''),       case when v_lang = 'de' then v_s.title else title_de end),
    title_en       = coalesce(nullif(btrim(p_overrides->>'title_en'), ''),       case when v_lang = 'de' then title_en else v_s.title end),
    description_de = coalesce(nullif(btrim(p_overrides->>'description_de'), ''), case when v_lang = 'de' then coalesce(v_s.description, description_de) else description_de end),
    description_en = coalesce(nullif(btrim(p_overrides->>'description_en'), ''), case when v_lang = 'de' then description_en else coalesce(v_s.description, description_en) end),
    language       = coalesce(v_lang, language),
    updated_by     = current_person_id()
  where id = v_s.session_id;
  update session_submission
     set status = 'approved', reviewed_by = current_person_id(), reviewed_at = now(), review_note = nullif(btrim(p_overrides->>'review_note'), '')
   where id = p_submission_id;
  perform log_audit('session.content_approved', 'session', v_s.session_id::text, null, jsonb_build_object('submission_id', p_submission_id, 'overrides', p_overrides));
end $$;

create or replace function reject_session_content(p_submission_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_s session_submission%rowtype;
begin
  select * into v_s from session_submission where id = p_submission_id for update;
  if not found then raise exception 'submission_not_found' using errcode = 'P0002'; end if;
  if not can_edit_session(v_s.session_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_s.status <> 'submitted' then raise exception 'not_pending' using errcode = 'P0001', detail = v_s.status; end if;
  update session_submission set status = 'rejected', reviewed_by = current_person_id(), reviewed_at = now(), review_note = nullif(btrim(p_note), '')
   where id = p_submission_id;
  perform log_audit('session.content_rejected', 'session', v_s.session_id::text, null, jsonb_build_object('submission_id', p_submission_id, 'note', p_note));
end $$;

create or replace function pending_submissions(p_event_id uuid default null)
returns table (
  id uuid, session_id uuid, event_id uuid, session_title_de text, session_title_en text, session_description_de text, session_description_en text,
  session_language text, publish_status text, start_at timestamptz, stage_name text,
  speaker_profile_id uuid, speaker_name text, title text, description text, topics text[], language text, notes text, created_at timestamptz
)
language sql stable security definer set search_path = public, extensions as $$
  select s.id, se.id, se.event_id, se.title_de, se.title_en, se.description_de, se.description_en, se.language, se.publish_status,
         sl.start_at, st.name,
         s.speaker_profile_id, (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) from person p where p.id = s.submitted_by),
         s.title, s.description, s.topics, s.language, s.notes, s.created_at
  from session_submission s
  join session se on se.id = s.session_id
  left join slot sl on sl.id = se.slot_id
  left join stage st on st.id = sl.stage_id
  where s.status = 'submitted'
    and (p_event_id is null or se.event_id = p_event_id)
    and can_edit_session(se.id)
  order by s.created_at
$$;

-- === A4 · deadline ============================================================
create table if not exists deadline (
  id             uuid primary key default gen_random_uuid(),
  edition_id     uuid not null references event (id) on delete cascade,
  key            text not null,                         -- z. B. presentation_upload
  audience       text not null default 'all',           -- speaker / partner / talent / volunteer / all
  due_at         timestamptz not null,
  label_de       text not null,
  label_en       text not null,
  description_de text,
  description_en text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (edition_id, key)
);
comment on table deadline is 'Fristen je Edition; speist Countdowns, Uploads (late-Markierung) und später Wiki/Checklisten.';
drop trigger if exists trg_deadline_updated on deadline;
create trigger trg_deadline_updated before update on deadline for each row execute function set_updated_at();
alter table deadline enable row level security;
drop policy if exists deadline_read on deadline;
create policy deadline_read on deadline for select to authenticated using (true);
revoke all on deadline from anon;
revoke insert, update, delete on deadline from authenticated;
grant select on deadline to authenticated;
grant all on deadline to service_role;

create or replace function upsert_deadline(p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into deadline (edition_id, key, audience, due_at, label_de, label_en, description_de, description_en)
  values ((p_data->>'edition_id')::uuid, p_data->>'key', coalesce(nullif(p_data->>'audience', ''), 'all'), (p_data->>'due_at')::timestamptz,
          p_data->>'label_de', p_data->>'label_en', nullif(p_data->>'description_de', ''), nullif(p_data->>'description_en', ''))
  on conflict (edition_id, key) do update set
    audience = excluded.audience, due_at = excluded.due_at, label_de = excluded.label_de, label_en = excluded.label_en,
    description_de = excluded.description_de, description_en = excluded.description_en
  returning id into v_id;
  perform log_audit('deadline.upsert', 'deadline', v_id::text, null, p_data);
  return v_id;
end $$;

insert into deadline (edition_id, key, audience, due_at, label_de, label_en, description_de, description_en)
select e.id, 'presentation_upload', 'speaker', '2027-04-14 12:00 Europe/Berlin'::timestamptz,
       'Präsentation hochladen', 'Upload your presentation',
       'Spätestens 48 Stunden vor deinem Slot, sonst bis 14.04.2027 12:00. Danach werden Uploads weiter angenommen und dem Team als verspätet gemeldet.',
       'At the latest 48 hours before your slot, otherwise by 14 April 2027, 12:00. Later uploads are still accepted and flagged to the team.'
from event e where e.is_edition and e.slug = 'fls27'
on conflict (edition_id, key) do nothing;

-- === A4 · Storage-Bucket + Pfadregel =============================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('speaker-assets', 'speaker-assets', false, 104857600,
        array['application/pdf', 'application/vnd.ms-powerpoint',
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'application/vnd.apple.keynote', 'application/x-iwork-keynote-sffkey',
              'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Pfad <edition_id>/<profile_id>/<kind>/<datei>: Speaker/Assistenz des Profils, Manager im Scope, Team.
create or replace function speaker_asset_path_allowed(p_name text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_profile uuid; v_edition uuid; v_sp speaker_profile%rowtype; v_me uuid := current_person_id();
begin
  if v_me is null or p_name is null then return false; end if;
  begin
    v_edition := split_part(p_name, '/', 1)::uuid;
    v_profile := split_part(p_name, '/', 2)::uuid;
  exception when others then return false; end;
  if split_part(p_name, '/', 3) not in ('presentation', 'photo', 'other') or split_part(p_name, '/', 4) = '' then return false; end if;
  select * into v_sp from speaker_profile where id = v_profile and edition_id = v_edition;
  if not found then return false; end if;
  return v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(v_profile) or is_staff();
end $$;

drop policy if exists "speaker assets read" on storage.objects;
drop policy if exists "speaker assets insert" on storage.objects;
drop policy if exists "speaker assets update" on storage.objects;
drop policy if exists "speaker assets delete" on storage.objects;
create policy "speaker assets read"   on storage.objects for select to authenticated using (bucket_id = 'speaker-assets' and speaker_asset_path_allowed(name));
create policy "speaker assets insert" on storage.objects for insert to authenticated with check (bucket_id = 'speaker-assets' and speaker_asset_path_allowed(name));
create policy "speaker assets update" on storage.objects for update to authenticated using (bucket_id = 'speaker-assets' and speaker_asset_path_allowed(name)) with check (bucket_id = 'speaker-assets' and speaker_asset_path_allowed(name));
create policy "speaker assets delete" on storage.objects for delete to authenticated using (bucket_id = 'speaker-assets' and speaker_asset_path_allowed(name));

-- === A4 · speaker_asset ======================================================
create table if not exists speaker_asset (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references speaker_profile (id) on delete cascade,
  session_id        uuid references session (id) on delete set null,
  kind              text not null check (kind in ('presentation', 'photo', 'other')),
  storage_path      text not null unique,
  filename          text not null,
  mime              text,
  size_bytes        bigint,
  version           integer not null default 1,
  is_current        boolean not null default true,
  late              boolean not null default false,                -- nach der Frist hochgeladen (angenommen, gemeldet)
  tech_check_status text not null default 'pending' check (tech_check_status in ('pending', 'checked', 'issue')),
  tech_check_note   text,
  tech_checked_by   uuid references person (id) on delete set null,
  tech_checked_at   timestamptz,
  slides_release    boolean not null default false,                -- Slid@Home: Freigabe für Teilnehmende
  uploaded_by       uuid references person (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists speaker_asset_profile_idx on speaker_asset (profile_id, kind, is_current);
create index if not exists speaker_asset_session_idx on speaker_asset (session_id);
comment on table speaker_asset is 'Dateien im Bucket speaker-assets: Präsentationen (Versionen, late, Technik-Check, Slid@Home), Fotos, Sonstiges.';
drop trigger if exists trg_speaker_asset_updated on speaker_asset;
create trigger trg_speaker_asset_updated before update on speaker_asset for each row execute function set_updated_at();
alter table speaker_asset enable row level security;
drop policy if exists sa_read on speaker_asset;
create policy sa_read on speaker_asset for select to authenticated using (
  exists (select 1 from speaker_profile sp where sp.id = profile_id and (sp.person_id = current_person_id() or sp.assistant_person_id = current_person_id()))
  or can_manage_speaker(profile_id) or is_staff());
revoke all on speaker_asset from anon;
revoke insert, update, delete on speaker_asset from authenticated;
grant select on speaker_asset to authenticated;
grant all on speaker_asset to service_role;
alter table speaker_profile drop constraint if exists speaker_profile_photo_asset_fk;
alter table speaker_profile add constraint speaker_profile_photo_asset_fk foreign key (photo_asset_id) references speaker_asset (id) on delete set null;

-- Frist-Fenster für eine Session: Deadline der Edition und 48 h vor dem Slot, das frühere gilt.
create or replace function presentation_window(p_session_id uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'deadline_at', d.due_at,
    'slot_start', sl.start_at,
    'effective_due', least(d.due_at, sl.start_at - interval '48 hours'),
    'late_now', now() > least(d.due_at, sl.start_at - interval '48 hours'),
    'accepts_late', true
  )
  from session se
  join event e on e.id = se.event_id
  left join slot sl on sl.id = se.slot_id
  left join deadline d on d.key = 'presentation_upload' and d.edition_id = coalesce(e.edition_id, e.id)
  where se.id = p_session_id
$$;

-- Nach erfolgreichem Upload in den Bucket: Eintrag mit Version, late-Markierung, Technik-Check offen.
create or replace function register_speaker_asset(
  p_profile_id uuid, p_kind text, p_storage_path text, p_filename text,
  p_mime text default null, p_size_bytes bigint default null, p_session_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_version integer; v_late boolean := false; v_due timestamptz; v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not (v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(p_profile_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('presentation', 'photo', 'other') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_storage_path not like v_sp.edition_id::text || '/' || p_profile_id::text || '/' || p_kind || '/%' then
    raise exception 'path_mismatch' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'speaker-assets' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002';
  end if;
  if p_session_id is not null and not exists (select 1 from session_speaker ss where ss.session_id = p_session_id and ss.person_id = v_sp.person_id) then
    raise exception 'session_mismatch' using errcode = '22023';
  end if;
  if p_kind = 'presentation' and p_session_id is not null then
    v_due := (presentation_window(p_session_id)->>'effective_due')::timestamptz;
    v_late := v_due is not null and now() > v_due;
  end if;
  select coalesce(max(version), 0) + 1 into v_version
    from speaker_asset where profile_id = p_profile_id and kind = p_kind and coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_session_id, '00000000-0000-0000-0000-000000000000'::uuid);
  update speaker_asset set is_current = false
   where profile_id = p_profile_id and kind = p_kind and is_current
     and coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_session_id, '00000000-0000-0000-0000-000000000000'::uuid);
  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename, mime, size_bytes, version, late, uploaded_by)
  values (p_profile_id, p_session_id, p_kind, p_storage_path, p_filename, p_mime, p_size_bytes, v_version, v_late, v_me)
  returning id into v_id;
  if p_kind = 'photo' then update speaker_profile set photo_asset_id = v_id where id = p_profile_id; end if;
  perform log_audit('speaker.asset', 'speaker_profile', p_profile_id::text, null,
    jsonb_build_object('asset_id', v_id, 'kind', p_kind, 'version', v_version, 'late', v_late, 'session_id', p_session_id));
  return jsonb_build_object('id', v_id, 'version', v_version, 'late', v_late, 'effective_due', v_due);
end $$;

-- Slid@Home: nur der Speaker selbst, nur mit Consent slides_publication
create or replace function set_slides_release(p_asset_id uuid, p_release boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_a speaker_asset%rowtype; v_sp speaker_profile%rowtype;
begin
  select * into v_a from speaker_asset where id = p_asset_id for update;
  if not found then raise exception 'asset_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_a.profile_id;
  if v_sp.person_id <> current_person_id() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_release and not coalesce((select c.granted from consent_current c where c.person_id = v_sp.person_id and c.consent_type = 'slides_publication'), false) then
    raise exception 'consent_required' using errcode = 'P0001', detail = 'slides_publication';
  end if;
  update speaker_asset set slides_release = p_release where id = p_asset_id;
  perform log_audit('speaker.slides_release', 'speaker_asset', p_asset_id::text, null, jsonb_build_object('release', p_release));
end $$;

-- Technik-Check durch Produktion/Programm/Admin (is_staff)
create or replace function set_tech_check(p_asset_id uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('pending', 'checked', 'issue') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update speaker_asset set tech_check_status = p_status, tech_check_note = nullif(btrim(p_note), ''),
         tech_checked_by = current_person_id(), tech_checked_at = now()
   where id = p_asset_id;
  if not found then raise exception 'asset_not_found' using errcode = 'P0002'; end if;
  perform log_audit('speaker.tech_check', 'speaker_asset', p_asset_id::text, null, jsonb_build_object('status', p_status, 'note', p_note));
end $$;

create or replace function my_speaker_assets(p_profile_id uuid default null)
returns table (id uuid, profile_id uuid, session_id uuid, kind text, storage_path text, filename text, mime text, size_bytes bigint,
               version integer, is_current boolean, late boolean, tech_check_status text, tech_check_note text, slides_release boolean,
               uploaded_by uuid, created_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select a.id, a.profile_id, a.session_id, a.kind, a.storage_path, a.filename, a.mime, a.size_bytes,
         a.version, a.is_current, a.late, a.tech_check_status, a.tech_check_note, a.slides_release, a.uploaded_by, a.created_at
  from speaker_asset a
  join speaker_profile sp on sp.id = a.profile_id
  where (p_profile_id is null or a.profile_id = p_profile_id)
    and (sp.person_id = current_person_id() or sp.assistant_person_id = current_person_id() or can_manage_speaker(a.profile_id) or is_staff())
  order by a.kind, a.session_id, a.version desc
$$;

-- Nächste Schritte um Inhalt, Präsentation und Foto (Asset) ergänzt
create or replace function speaker_next_steps(p_profile_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_sp speaker_profile%rowtype; v_p person%rowtype; v_me uuid := current_person_id();
  v_profile boolean; v_photo boolean; v_consents boolean; v_session boolean; v_ticket boolean; v_content boolean; v_presentation boolean; v_open text[] := '{}';
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not (v_sp.person_id = v_me or v_sp.assistant_person_id = v_me or can_manage_speaker(p_profile_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_p from person where id = v_sp.person_id;
  v_profile  := coalesce(nullif(btrim(v_p.first_name), ''), '') <> '' and coalesce(nullif(btrim(v_p.last_name), ''), '') <> ''
                and coalesce(nullif(btrim(v_sp.job_title), ''), '') <> '' and coalesce(nullif(btrim(v_sp.bio_short_en), ''), '') <> '';
  v_photo    := v_p.photo_url is not null or v_sp.photo_asset_id is not null;
  v_consents := coalesce((select c.granted from consent_current c where c.person_id = v_p.id and c.consent_type = 'speaker_release'), false)
                and coalesce((select c.granted from consent_current c where c.person_id = v_p.id and c.consent_type = 'photo_video'), false);
  v_session  := exists (select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                        where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id));
  v_content  := v_session and not exists (
                  select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                  where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)
                    and not exists (select 1 from session_submission s where s.session_id = se.id and s.status = 'approved')
                    and coalesce(se.description_de, se.description_en) is null);
  v_presentation := v_session and not exists (
                  select 1 from session_speaker ss join session se on se.id = ss.session_id join event e on e.id = se.event_id
                  where ss.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id)
                    and se.format not in ('panel', 'networking', 'reception', 'side_event', 'break', 'company_tour')
                    and not exists (select 1 from speaker_asset a where a.profile_id = v_sp.id and a.session_id = se.id and a.kind = 'presentation' and a.is_current));
  v_ticket   := exists (select 1 from ticket t join event e on e.id = t.event_id
                        where t.person_id = v_p.id and (e.edition_id = v_sp.edition_id or e.id = v_sp.edition_id) and t.status in ('valid', 'requested'));
  if not v_profile      then v_open := array_append(v_open, 'profile'); end if;
  if not v_photo        then v_open := array_append(v_open, 'photo'); end if;
  if not v_consents     then v_open := array_append(v_open, 'consents'); end if;
  if not v_session      then v_open := array_append(v_open, 'session'); end if;
  if v_session and not v_content      then v_open := array_append(v_open, 'session_content'); end if;
  if v_session and not v_presentation then v_open := array_append(v_open, 'presentation'); end if;
  if not v_ticket       then v_open := array_append(v_open, 'ticket'); end if;
  return jsonb_build_object(
    'profile', v_profile, 'photo', v_photo, 'consents', v_consents, 'session', v_session,
    'session_content', case when v_session then v_content end,
    'presentation', case when v_session then v_presentation end,
    'ticket', v_ticket, 'hospitality', v_sp.hospitality_status,
    'open', to_jsonb(v_open)
  );
end $$;

select harden_definer_functions();
