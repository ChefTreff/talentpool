-- 0246 · Folien in den Technik-Ordner (Google Drive): Zielordner je Edition, Spiegelstand, Server-Funktionen (SPK-023)
-- Angewendet von der Architektur-Session am 01.10.2026 als 20261001131959.
-- v6_folien_drive · Folien der Speaker in den Technik-Ordner (Google Drive) spiegeln (SPK-023, D13)
--
-- Zweck: Konrad 21.09./24.09.: „die Slides entsprechend der Bühne und des Tages
-- richtig benannt in einem Google-Drive-Ordner für die Technik … bei einem
-- Update aktualisiert“. Ordner je Bühne, Unterordner je Veranstaltungstag, eine
-- Datei je Präsentation; eine neue Fassung ersetzt die Datei dort. Übertragen
-- wird serverseitig mit einem Google-Dienstkonto (`GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`,
-- docs/runbooks/drive-service-konto.md) — die Datenbank hält nur, wohin
-- gespiegelt wird und was drüben schon liegt.
--
-- Teile:
--   * `slide_drive_setting` — Zielordner je Edition. **Eigene Tabelle, nicht
--     `event`:** `event` ist für jedes angemeldete Konto lesbar (Tabellen-Grant
--     seit 0002). Ist der Ordner per Link geteilt, wäre seine ID der Schlüssel zu
--     allen Folien der Edition. Lesen nur der Server, setzen nur der Abschnitt
--     `tech` (`set_edition_slides_folder`, mit Audit). FLS27 bekommt den Ordner
--     aus SPK-023 (`1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE`, geteilte Ablage).
--   * `slide_drive_mirror` — was in Drive liegt, je Speaker-Profil und Session:
--     eine Datei je Präsentationslinie, eine neue Fassung ersetzt ihren Inhalt
--     (die Drive-Datei behält ID und Freigabe). **Bewusst ohne Fremdschlüssel:**
--     die Zeile muss das Löschen überleben (Folie entfernt, Profil gelöscht,
--     Session aus dem Slot genommen), bis die Kopie in Drive weg ist — sonst
--     bliebe sie ohne Verweis liegen (Löschkonzept 18.09., Fremdsysteme). Sie
--     hält nur IDs, Status und Fehlerschlüssel, keine Namen.
--   * `slide_mirror_candidates(edition, asset)` — nur Server: jede aktuelle
--     Präsentation mit Session, Slot, Bühne, Tag, Speaker-Namen, Zielordner und
--     Spiegelstand. Daraus rechnet `lib/drive/ziel.ts` Ordner, Dateinamen und
--     was zu tun ist.
--   * `slide_mirror_orphans(limit)` — nur Server: Drive-Kopien ohne aktuelle
--     Präsentation im Programm. Der Cron `/api/cron/mail` räumt sie ab.
--   Schreiben in `slide_drive_mirror` nur mit service_role (RLS an, keine
--   Policy, kein Grant für anon/authenticated) — wie `storage_purge_queue`.
--
-- Abweichungen: keine. Die Ordner-ID ist Konfiguration in einer Tabelle
-- (Konvention §2), der Schlüssel des Dienstkontos bleibt in Vercel.
set search_path = public, extensions;

-- === Zielordner je Edition ===================================================

create table if not exists slide_drive_setting (
  edition_id uuid primary key references event (id) on delete cascade,
  folder_id  text not null check (folder_id ~ '^[A-Za-z0-9_-]{10,100}$'),
  updated_by uuid references person (id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table slide_drive_setting is
  'Technik-Ordner in Google Drive je Edition (SPK-023). Nur der Server liest ihn; setzen über set_edition_slides_folder (Abschnitt tech). Nicht an event, weil event für alle angemeldeten Konten lesbar ist.';
alter table slide_drive_setting enable row level security;
revoke all on slide_drive_setting from anon, authenticated;
-- Ausdrücklich, falls die Standardrechte für neue Tabellen fehlen: der Server
-- liest den Ordner für die Admin-Karte; geschrieben wird nur über die Funktion.
grant select on slide_drive_setting to service_role;

insert into slide_drive_setting (edition_id, folder_id)
select e.id, '1S9d60I8FTA3mtPmYnN1t3Xys_2INQSuE' from event e where e.is_edition and e.slug = 'fls27'
on conflict (edition_id) do nothing;

-- === Was in Drive liegt ======================================================

create table if not exists slide_drive_mirror (
  id            uuid primary key default gen_random_uuid(),
  -- Ohne Fremdschlüssel, siehe Kopf: die Zeile ist der Weg zur Kopie in Drive.
  profile_id    uuid not null,
  session_id    uuid not null,
  asset_id      uuid,
  asset_version integer,
  drive_file_id text check (drive_file_id is null or drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  -- sha256 aus Zielordner, Bühne, Tag und Dateinamen: ändert sich der Slot, ist
  -- die Kopie veraltet, ohne dass hier ein Name steht.
  target_hash   text check (target_hash is null or target_hash ~ '^[0-9a-f]{64}$'),
  status        text not null check (status in ('ok', 'error')),
  error_key     text check (error_key is null or error_key ~ '^[a-z_]{1,60}$'),
  error_detail  text check (error_detail is null or length(error_detail) <= 500),
  attempts      integer not null default 0 check (attempts >= 0),
  mirrored_at   timestamptz,
  updated_at    timestamptz not null default now(),
  constraint slide_drive_mirror_linie_key unique (profile_id, session_id)
);
comment on table slide_drive_mirror is
  'Spiegelstand je Präsentationslinie (Speaker-Profil × Session) im Technik-Ordner (SPK-023). Ohne Fremdschlüssel: überlebt das Löschen, bis die Drive-Kopie entfernt ist. Nur service_role schreibt.';
create index if not exists slide_drive_mirror_asset_idx on slide_drive_mirror (asset_id);
alter table slide_drive_mirror enable row level security;
revoke all on slide_drive_mirror from anon, authenticated;
grant select, insert, update, delete on slide_drive_mirror to service_role;

-- === Zielordner setzen (Abschnitt tech) ======================================

create or replace function set_edition_slides_folder(p_edition_id uuid, p_folder_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_me  uuid := current_person_id();
  v_neu text := nullif(btrim(coalesce(p_folder_id, '')), '');
  v_alt text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('tech') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from event e where e.id = p_edition_id and e.is_edition) then
    raise exception 'edition_not_found' using errcode = 'P0002';
  end if;
  if v_neu is not null and v_neu !~ '^[A-Za-z0-9_-]{10,100}$' then
    raise exception 'invalid_folder_id' using errcode = '22023';
  end if;
  select s.folder_id into v_alt from slide_drive_setting s where s.edition_id = p_edition_id;
  if v_neu is null then
    -- Leer heisst: nicht mehr spiegeln. Was schon drüben liegt, bleibt dort.
    delete from slide_drive_setting where edition_id = p_edition_id;
  else
    insert into slide_drive_setting (edition_id, folder_id, updated_by, updated_at)
    values (p_edition_id, v_neu, v_me, now())
    on conflict (edition_id) do update
      set folder_id = excluded.folder_id, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform log_audit('edition.slides_folder', 'event', p_edition_id::text,
    jsonb_build_object('folder_id', v_alt), jsonb_build_object('folder_id', v_neu));
end $$;

-- === Was zu spiegeln ist (nur Server) ========================================

create or replace function slide_mirror_candidates(p_edition_id uuid default null, p_asset_id uuid default null)
returns table (
  asset_id uuid, asset_version integer, profile_id uuid, session_id uuid, edition_id uuid,
  storage_path text, filename text, mime text, size_bytes bigint,
  first_name text, last_name text, session_title text,
  slot_id uuid, slot_start timestamptz, stage_id uuid, stage_name text,
  event_day_id uuid, day_date date, day_label text, timezone text,
  folder_id text,
  mirror_id uuid, drive_file_id text, mirror_asset_id uuid, target_hash text,
  mirror_status text, error_key text, error_detail text, attempts integer, mirrored_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select a.id, a.version, a.profile_id, a.session_id, sp.edition_id,
         a.storage_path, a.filename, a.mime, a.size_bytes,
         -- Nur die zwei Namensfelder, nie `person` als Ganzes (Konvention §2).
         p.first_name, p.last_name, coalesce(se.title_de, se.title_en),
         sl.id, sl.start_at, st.id, st.name,
         d.id, d.day_date, coalesce(d.label_de, d.label_en), coalesce(ev.timezone, 'Europe/Berlin'),
         ds.folder_id,
         m.id, m.drive_file_id, m.asset_id, m.target_hash, m.status, m.error_key, m.error_detail,
         m.attempts, m.mirrored_at
    from speaker_asset a
    join speaker_profile sp on sp.id = a.profile_id
    join person p on p.id = sp.person_id
    join session se on se.id = a.session_id
    left join slot sl on sl.id = se.slot_id
    left join stage st on st.id = sl.stage_id
    left join event_day d on d.id = sl.event_day_id
    left join event ev on ev.id = coalesce(st.event_id, se.event_id)
    left join slide_drive_setting ds on ds.edition_id = sp.edition_id
    left join slide_drive_mirror m on m.profile_id = a.profile_id and m.session_id = a.session_id
   where a.kind = 'presentation'
     and a.is_current
     and a.session_id is not null
     and (p_edition_id is null or sp.edition_id = p_edition_id)
     and (p_asset_id is null or a.id = p_asset_id)
   order by d.day_date nulls last, st.sort_order nulls last, sl.start_at nulls last, p.last_name, p.first_name;
end $$;
revoke execute on function slide_mirror_candidates(uuid, uuid) from public, anon, authenticated;

-- === Kopien ohne Präsentation im Programm (nur Server) =======================

create or replace function slide_mirror_orphans(p_limit integer default 50)
returns table (mirror_id uuid, drive_file_id text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select m.id, m.drive_file_id
    from slide_drive_mirror m
   where not exists (
           select 1
             from speaker_asset a
             join session se on se.id = a.session_id
            where a.profile_id = m.profile_id
              and a.session_id = m.session_id
              and a.kind = 'presentation'
              and a.is_current
              and se.slot_id is not null)
   order by m.updated_at
   limit greatest(1, least(coalesce(p_limit, 50), 500));
end $$;
revoke execute on function slide_mirror_orphans(integer) from public, anon, authenticated;

select harden_definer_functions();
