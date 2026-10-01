-- 0000 · Datensatz je Hackathon-Challenge (HACK-012): privater Bucket hack-datasets, Pfadregel
-- fürs Lesen, Schreiben nur über signierte Upload-Adressen des Servers.
--
-- Anlass: Emilio (Call 24.09., HACK-006): Daten für technische Challenges kommen per Mail oder
-- Link. Backlog-Empfehlung (Kaggle-Muster): Partner lädt einmal hoch, Teilnehmende sehen den
-- Download nur für die Challenge ihres Teams (signierte Adresse, privater Bucket).
--
-- Diese Migration:
--   1 Bucket `hack-datasets`: **privat**, 50 MB je Datei (Grenze wie partner-assets; größere
--     Daten als Link unter „Ressourcen“ der Challenge), Datenformate als MIME-Liste.
--   2 Tabelle `hack_dataset` (eine aktuelle Datei je Challenge, ältere bleiben als Version):
--     RLS an, **keine Grants** — nur über die Funktionen unten.
--   3 Rechte:
--      * `can_manage_hack_dataset(challenge)`: Hack-Team (`is_hack_team()`) oder wer die
--        Organisation der Challenge bearbeiten darf (`partner_can_edit(org)`).
--      * `can_read_hack_dataset(challenge)`: dazu Partner der Organisation (`is_partner_of`)
--        und **Mitglieder eines Teams dieser Challenge** (nicht zurückgezogen). Sonst niemand —
--        auch nicht andere Teilnehmende.
--   4 Storage-Policies auf `storage.objects` für `hack-datasets`:
--      * **Lesen** (select, authenticated): `hack_dataset_path_allowed(name)` — Pfad
--        `<challenge_id>/<datei>`; Verwalter lesen jede Version, Leser nur die **aktuelle**
--        Datei. Objekte ohne Zeile in `hack_dataset` liest niemand außer dem Hack-Team.
--      * **Schreiben/Ändern/Löschen: keine Policy.** Hochladen geht nur über die Server-Route
--        `/api/hackathon/dataset`, die `can_manage_hack_dataset` prüft und mit service_role genau
--        einen selbst gebauten Pfad `<challenge_id>/<uuid>-<name>` signiert (Muster Media Kit).
--   5 `register_hack_dataset(…)`: prüft Rechte, Pfad, Objekt im Bucket und die Größe; macht die
--     neue Datei zur aktuellen; Audit `hack.dataset_uploaded`.
--   6 `hack_challenge_dataset(challenge)`: die aktuelle Datei für Leser (42501 sonst). Die App
--     signiert mit der **Sitzung der Person** — die Lese-Policy gilt also auch dort.
--   7 `hack_dataset_targets(p_edition_id)`: freigegebene Challenges, deren Datensatz die Person
--     pflegen darf (Hack-Team: alle; Partner: die der eigenen Organisation), mit der aktuellen
--     Datei — für Partner-Portal und Admin.
-- Keine Änderung an `publish_hack_challenge`, `hack_challenges`, `my_hack`.
-- Fehlerschlüssel neu: keine (`not allowed`, `path_mismatch`, `object_not_found`, `file_rules`
-- gibt es schon).
-- Test: supabase/tests/v6_hack_datensatz.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hack-datasets', 'hack-datasets', false, 52428800,
        array['text/csv', 'text/tab-separated-values', 'application/json', 'text/plain',
              'application/zip', 'application/gzip', 'application/x-gzip', 'application/pdf',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.apache.parquet', 'application/octet-stream'])
on conflict (id) do update set
  public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- 2 · Tabelle

create table if not exists hack_dataset (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references hack_challenge(id) on delete cascade,
  storage_path text not null unique,
  filename     text not null check (length(filename) between 1 and 200),
  mime         text,
  size_bytes   bigint check (size_bytes is null or size_bytes between 1 and 52428800),
  is_current   boolean not null default true,
  uploaded_by  uuid references person(id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index if not exists hack_dataset_current_idx on hack_dataset (challenge_id) where is_current;
comment on table hack_dataset is
  'Datensatz je Hackathon-Challenge (HACK-012) im privaten Bucket hack-datasets (<challenge_id>/<datei>). Zugriff nur über can_manage_hack_dataset, can_read_hack_dataset, register_hack_dataset, hack_challenge_dataset.';
alter table hack_dataset enable row level security;
revoke all on hack_dataset from anon, authenticated;

-- ---------------------------------------------------------------- 3 · Rechte

create or replace function can_manage_hack_dataset(p_challenge_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select current_person_id() is not null and (
    is_hack_team()
    or exists (select 1 from hack_challenge c
                where c.id = p_challenge_id and c.org_id is not null and partner_can_edit(c.org_id)))
$$;

create or replace function can_read_hack_dataset(p_challenge_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select current_person_id() is not null and (
    can_manage_hack_dataset(p_challenge_id)
    or exists (select 1 from hack_challenge c
                where c.id = p_challenge_id and c.org_id is not null and is_partner_of(c.org_id))
    or exists (select 1 from hack_team t join hack_team_member m on m.team_id = t.id
                where t.challenge_id = p_challenge_id and t.status <> 'withdrawn'
                  and m.person_id = current_person_id()))
$$;

-- ---------------------------------------------------------------- 4 · Storage-Policy

create or replace function hack_dataset_path_allowed(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_challenge uuid; v_d hack_dataset;
begin
  if current_person_id() is null or p_name is null then return false; end if;
  begin v_challenge := split_part(p_name, '/', 1)::uuid; exception when others then return false; end;
  select * into v_d from hack_dataset d where d.storage_path = p_name and d.challenge_id = v_challenge;
  if not found then return is_hack_team(); end if;   -- Waisen: nur das Hack-Team
  if can_manage_hack_dataset(v_challenge) then return true; end if;
  return v_d.is_current and can_read_hack_dataset(v_challenge);
end $$;
revoke all on function hack_dataset_path_allowed(text) from public, anon;
grant execute on function hack_dataset_path_allowed(text) to authenticated;
comment on function hack_dataset_path_allowed(text) is
  'Pfadregel (HACK-012) für den Bucket hack-datasets: Verwalter (Hack-Team, Partner mit Bearbeitungsrecht) lesen alle Versionen, Leser (Partner der Organisation, Teams der Challenge) nur die aktuelle Datei.';

drop policy if exists "hack datasets read" on storage.objects;
create policy "hack datasets read" on storage.objects
  for select to authenticated
  using (bucket_id = 'hack-datasets' and hack_dataset_path_allowed(name));

-- ---------------------------------------------------------------- 5 · Eintragen

create or replace function register_hack_dataset(p_challenge_id uuid, p_storage_path text, p_filename text,
                                                 p_mime text default null, p_size_bytes bigint default null)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_manage_hack_dataset(p_challenge_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_storage_path is null or p_storage_path not like p_challenge_id::text || '/%'
     or split_part(p_storage_path, '/', 3) <> '' or split_part(p_storage_path, '/', 2) = '' then
    raise exception 'path_mismatch' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'hack-datasets' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002';
  end if;
  if p_size_bytes is not null and (p_size_bytes < 1 or p_size_bytes > 52428800) then
    raise exception 'file_rules' using errcode = '22023', detail = 'max_bytes';
  end if;
  update hack_dataset set is_current = false where challenge_id = p_challenge_id and is_current;
  insert into hack_dataset (challenge_id, storage_path, filename, mime, size_bytes, uploaded_by)
  values (p_challenge_id, p_storage_path, left(coalesce(nullif(btrim(p_filename), ''), 'dataset'), 200),
          nullif(btrim(coalesce(p_mime, '')), ''), p_size_bytes, v_me)
  returning id into v_id;
  perform log_audit('hack.dataset_uploaded', 'hack_challenge', p_challenge_id::text, null,
                    jsonb_build_object('dataset_id', v_id, 'filename', p_filename, 'size_bytes', p_size_bytes));
  return v_id;
end $$;

-- ---------------------------------------------------------------- 6 · Lesen

create or replace function hack_challenge_dataset(p_challenge_id uuid)
 RETURNS TABLE(dataset_id uuid, storage_path text, filename text, mime text, size_bytes bigint, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_read_hack_dataset(p_challenge_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select d.id, d.storage_path, d.filename, d.mime, d.size_bytes, d.created_at
      from hack_dataset d where d.challenge_id = p_challenge_id and d.is_current;
end $$;

-- ---------------------------------------------------------------- 7 · Pflegeliste

create or replace function hack_dataset_targets(p_edition_id uuid default null, p_language text default 'en')
 RETURNS TABLE(challenge_id uuid, title text, org_name text, dataset_id uuid, storage_path text,
               filename text, size_bytes bigint, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select c.id, hack_text(c.title_de, c.title_en, p_language), coalesce(o.communication_name, o.legal_name),
           d.id, d.storage_path, d.filename, d.size_bytes, d.created_at
      from hack_challenge c
      left join organization o on o.id = c.org_id
      left join hack_dataset d on d.challenge_id = c.id and d.is_current
     where c.edition_id = hack_edition(p_edition_id) and c.status = 'published'
       and can_manage_hack_dataset(c.id)
     order by c.sort_order, hack_text(c.title_de, c.title_en, p_language);
end $$;

select harden_definer_functions();
