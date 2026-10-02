-- 0257 · Event-Fotos je besuchtem Event: privater Bucket event-photos, Lesen nur mit Check-in, Verwaltung im Abschnitt photos, Löschwunsch (TAL-010)
-- Angewendet von der Architektur-Session am 02.10.2026 als 20261002091014.
-- event-photos, sichtbar nur für Personen, die eingecheckt waren; Löschwunsch an das Team.
--
-- Anlass: Konzept docs/talent-konzepte-009-011.md, Konrads Antworten K-43 (02.10.): (4) das Team
-- lädt eine Auswahl hoch, kein Drive-Spiegel; (5) Teilnahme = eingecheckt, No-Shows bekommen
-- keinen Zugriff.
--
-- Diese Migration:
--   1 Admin-Abschnitt `photos` (admin, area_lead_talent, talent_team, marketing_team).
--   2 Bucket `event-photos`: **privat**, 15 MB je Bild, JPEG/PNG/WebP.
--   3 Tabellen `event_photo` (Event, Pfad, Credit, Reihenfolge, veröffentlicht) und
--     `event_photo_removal_request` (Löschwunsch einer Person zu einem Foto): RLS an,
--     **keine Grants** — nur über Funktionen.
--   4 Teilnahme `attended_event(event)`: Summit = Ticket des Events mit Check-in
--     (`checked_in_at` gesetzt oder Status `checked_in`); Community-Event = Anmeldung mit Status
--     `attended` (Luma-Abgleich). Kein Check-in, kein Zugriff (K-43).
--   5 Storage-Policy „event photos read“ (select, authenticated) über
--     `event_photo_path_allowed(name)`: Verwalter (Abschnitt photos) jede Datei, sonst nur
--     **veröffentlichte** Fotos eines Events, bei dem die Person eingecheckt war. Waisen nur
--     Verwalter. **Keine Schreib-Policy**: Hochladen nur über `/api/admin/fotos` (Abschnitt
--     photos, service_role signiert genau einen Pfad `<event_id>/<uuid>-<name>`).
--   6 Verwalten: `register_event_photo`, `set_event_photo` (veröffentlichen, Credit,
--     Reihenfolge), `delete_event_photo` (liefert den Pfad; die Route löscht das Objekt),
--     `event_photos_admin`, `photo_removal_requests_admin`, `handle_photo_removal`. Audit je Schritt.
--   7 Teilnehmende: `my_photo_events()` (Events mit veröffentlichten Fotos, bei denen ich war),
--     `event_photos(event)` (42501 ohne Teilnahme), `request_photo_removal(photo, note)`.
-- Fehlerschlüssel neu: `not_attended` (lib/rpc-error.ts + Wörterbücher).
-- Test: supabase/tests/v6_event_fotos.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Abschnitt

insert into admin_section_role (section, role) values
  ('photos', 'admin'), ('photos', 'area_lead_talent'), ('photos', 'talent_team'), ('photos', 'marketing_team')
on conflict do nothing;

-- ---------------------------------------------------------------- 2 · Bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-photos', 'event-photos', false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- 3 · Tabellen

create table if not exists event_photo (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references event(id) on delete cascade,
  storage_path text not null unique,
  filename     text not null check (length(filename) between 1 and 200),
  credit       text check (credit is null or length(credit) <= 120),
  sort_order   integer not null default 0,
  published    boolean not null default false,
  uploaded_by  uuid references person(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists event_photo_event_idx on event_photo (event_id);
comment on table event_photo is 'Fotoauswahl je Event (TAL-010) im privaten Bucket event-photos (<event_id>/<datei>). Sichtbar nur veröffentlicht und nur für Eingecheckte.';
alter table event_photo enable row level security;
revoke all on event_photo from anon, authenticated;

create table if not exists event_photo_removal_request (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references event_photo(id) on delete cascade,
  person_id   uuid not null references person(id) on delete cascade,
  note        text check (note is null or length(note) <= 500),
  status      text not null default 'open' check (status in ('open', 'done', 'rejected')),
  created_at  timestamptz not null default now(),
  handled_by  uuid references person(id) on delete set null,
  handled_at  timestamptz
);
create unique index if not exists event_photo_removal_open_idx on event_photo_removal_request (photo_id, person_id) where status = 'open';
comment on table event_photo_removal_request is 'Löschwunsch einer Person zu einem Event-Foto (TAL-010); das Team entscheidet.';
alter table event_photo_removal_request enable row level security;
revoke all on event_photo_removal_request from anon, authenticated;

-- ---------------------------------------------------------------- 4 · Teilnahme und Rechte

create or replace function attended_event(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select current_person_id() is not null and (
    exists (select 1 from ticket t where t.event_id = p_event_id and t.person_id = current_person_id()
             and (t.checked_in_at is not null or t.status = 'checked_in'))
    or exists (select 1 from registration r where r.event_id = p_event_id and r.person_id = current_person_id()
                and r.status = 'attended'))
$$;

create or replace function can_manage_event_photos()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select current_person_id() is not null and coalesce(has_admin_section('photos'), false)
$$;

-- ---------------------------------------------------------------- 5 · Storage-Policy

create or replace function event_photo_path_allowed(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_event uuid; v_p event_photo;
begin
  if current_person_id() is null or p_name is null then return false; end if;
  begin v_event := split_part(p_name, '/', 1)::uuid; exception when others then return false; end;
  if can_manage_event_photos() then return true; end if;
  select * into v_p from event_photo p where p.storage_path = p_name and p.event_id = v_event;
  if not found then return false; end if;
  return v_p.published and attended_event(v_event);
end $$;
revoke all on function event_photo_path_allowed(text) from public, anon;
grant execute on function event_photo_path_allowed(text) to authenticated;
comment on function event_photo_path_allowed(text) is
  'Pfadregel (TAL-010) für den Bucket event-photos: Verwalter (Abschnitt photos) alles, sonst nur veröffentlichte Fotos eines Events, bei dem die Person eingecheckt war.';

drop policy if exists "event photos read" on storage.objects;
create policy "event photos read" on storage.objects
  for select to authenticated
  using (bucket_id = 'event-photos' and event_photo_path_allowed(name));

-- ---------------------------------------------------------------- 6 · Verwalten

create or replace function register_event_photo(p_event_id uuid, p_storage_path text, p_filename text, p_credit text default null)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid;
begin
  if not can_manage_event_photos() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from event where id = p_event_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_storage_path is null or p_storage_path not like p_event_id::text || '/%'
     or split_part(p_storage_path, '/', 3) <> '' or split_part(p_storage_path, '/', 2) = '' then
    raise exception 'path_mismatch' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'event-photos' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002';
  end if;
  insert into event_photo (event_id, storage_path, filename, credit, sort_order, uploaded_by)
  values (p_event_id, p_storage_path, left(coalesce(nullif(btrim(p_filename), ''), 'foto'), 200),
          nullif(left(btrim(coalesce(p_credit, '')), 120), ''),
          coalesce((select max(sort_order) + 1 from event_photo where event_id = p_event_id), 0), current_person_id())
  returning id into v_id;
  perform log_audit('photo.uploaded', 'event', p_event_id::text, null, jsonb_build_object('photo_id', v_id));
  return v_id;
end $$;

create or replace function set_event_photo(p_photo_id uuid, p_published boolean, p_credit text default null)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_p event_photo;
begin
  if not can_manage_event_photos() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_p from event_photo where id = p_photo_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update event_photo set published = coalesce(p_published, false),
                         credit = nullif(left(btrim(coalesce(p_credit, '')), 120), '')
   where id = p_photo_id;
  perform log_audit('photo.updated', 'event', v_p.event_id::text, jsonb_build_object('published', v_p.published),
                    jsonb_build_object('photo_id', p_photo_id, 'published', coalesce(p_published, false)));
end $$;

create or replace function delete_event_photo(p_photo_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_p event_photo;
begin
  if not can_manage_event_photos() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_p from event_photo where id = p_photo_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- Offene Löschwünsche zu diesem Foto sind damit erledigt (die Zeilen gehen mit dem Foto).
  delete from event_photo where id = p_photo_id;
  perform log_audit('photo.deleted', 'event', v_p.event_id::text, jsonb_build_object('photo_id', p_photo_id, 'filename', v_p.filename), null);
  return v_p.storage_path;
end $$;

create or replace function event_photos_admin(p_event_id uuid default null)
 RETURNS TABLE(event_id uuid, event_name text, start_date date, photo_id uuid, storage_path text, filename text,
               credit text, published boolean, open_requests integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not can_manage_event_photos() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select e.id, e.name, e.start_date, p.id, p.storage_path, p.filename, p.credit, p.published,
           (select count(*)::integer from event_photo_removal_request r where r.photo_id = p.id and r.status = 'open')
      from event_photo p join event e on e.id = p.event_id
     where p_event_id is null or p.event_id = p_event_id
     order by e.start_date desc nulls last, p.sort_order, p.created_at;
end $$;

create or replace function photo_removal_requests_admin()
 RETURNS TABLE(request_id uuid, photo_id uuid, event_name text, filename text, first_name text, last_name text,
               note text, status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not can_manage_event_photos() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.id, p.id, e.name, p.filename, pe.first_name, pe.last_name, r.note, r.status, r.created_at
      from event_photo_removal_request r
      join event_photo p on p.id = r.photo_id
      join event e on e.id = p.event_id
      join person pe on pe.id = r.person_id
     order by (r.status = 'open') desc, r.created_at desc;
end $$;

create or replace function handle_photo_removal(p_request_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not can_manage_event_photos() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('done', 'rejected') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update event_photo_removal_request set status = p_status, handled_by = current_person_id(), handled_at = now()
   where id = p_request_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform log_audit('photo.removal_handled', 'event_photo_removal_request', p_request_id::text, null, jsonb_build_object('status', p_status));
end $$;

-- ---------------------------------------------------------------- 7 · Teilnehmende

create or replace function my_photo_events()
 RETURNS TABLE(event_id uuid, event_name text, start_date date, photos integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select e.id, e.name, e.start_date, count(p.id)::integer
      from event e join event_photo p on p.event_id = e.id and p.published
     where attended_event(e.id)
     group by e.id, e.name, e.start_date
     order by e.start_date desc nulls last;
end $$;

create or replace function event_photos(p_event_id uuid)
 RETURNS TABLE(photo_id uuid, storage_path text, filename text, credit text, removal_requested boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not attended_event(p_event_id) then raise exception 'not_attended' using errcode = '42501'; end if;
  return query
    select p.id, p.storage_path, p.filename, p.credit,
           exists (select 1 from event_photo_removal_request r where r.photo_id = p.id
                    and r.person_id = current_person_id() and r.status = 'open')
      from event_photo p
     where p.event_id = p_event_id and p.published
     order by p.sort_order, p.created_at;
end $$;

create or replace function request_photo_removal(p_photo_id uuid, p_note text default null)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_p event_photo; v_id uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_p from event_photo where id = p_photo_id and published;
  if not found or not attended_event(v_p.event_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(v_note) > 500 then raise exception 'too_long' using errcode = '22023', detail = '500'; end if;
  insert into event_photo_removal_request (photo_id, person_id, note)
  values (p_photo_id, current_person_id(), v_note)
  on conflict (photo_id, person_id) where status = 'open' do nothing
  returning id into v_id;
  -- Audit ohne Text der Notiz (kann Gesundheits- oder Lebensumstände enthalten).
  perform log_audit('photo.removal_requested', 'event', v_p.event_id::text, null, jsonb_build_object('photo_id', p_photo_id));
  return v_id;
end $$;

select harden_definer_functions();
