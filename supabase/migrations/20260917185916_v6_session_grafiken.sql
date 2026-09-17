-- =============================================================================
-- 0111 · Welle 6 · Bilder am Auftritt: Bühnenfotos und Slot-Grafiken (A6, ADM-039)
--     Angewendet von der Architektur-Session am 17.09.2026 als 20260917185916
--
-- Bühnenfotos und Programmgrafiken entstehen heute ausserhalb des Portals und
-- liegen nirgends. Der Speaker sieht sein Foto nie, das Marketing sucht es in
-- einem Ordner, und die Event-App bekommt die Slot-Grafik per Hand.
--
-- **Die Zuordnung ist die eigentliche Entscheidung** — und sie war beinahe
-- falsch. Konrad nennt drei Bildarten, aber sie hängen nicht an derselben
-- Sache (Hinweis der Speaker-Session, 17.09.):
--
-- * **Bühnenfoto** und **Slot-Grafik** gehören an die **Session**: sie zeigen
--   einen Auftritt. Mehrere je Session sind normal.
-- * Die **Speaker-Grafik** („Hear Me Speak") gehört an den **Menschen**, nicht
--   an den Auftritt. Ein Speaker mit drei Sessions hat **eine** Grafik, nicht
--   drei. Läge sie hier, vervielfältigte sie sich, und niemand wüsste, welche
--   gilt. Sie bleibt deshalb in `speaker_asset` — dort gibt es `kind` und die
--   Versionierung bereits.
--
-- Die Regel, die daraus folgt und die man sich merken kann: **was an einem
-- Auftritt hängt, hängt an der Session; was an einem Menschen hängt, am Profil.**
--
-- **Versionieren statt löschen.** Ein Bühnenfoto kann der Speaker längst gesehen
-- und weiterverwendet haben; verschwindet es kommentarlos, ist das ein
-- Supportfall statt einer Korrektur. Ein neues Bild setzt das alte auf
-- `is_current = false` — dasselbe Muster wie bei `speaker_asset`. Hart löschen
-- darf nur Admin, für den Fall, der wirklich weg muss (falsches Gesicht,
-- Widerruf).
--
-- **Der Speaker sieht nur seine eigenen.** `my_session_photos()` geht über
-- `session_speaker`; die RPC gibt den Pfad heraus, die signierte URL erzeugt der
-- Server. Beim **ersten** Foto je Session geht eine Mail heraus — beim zweiten
-- nicht mehr, sonst wird aus einer Nachricht eine Benachrichtigungslawine.
--
-- Neue Rolle `marketing_team`: darf hochladen und ersetzen, aber nicht hart
-- löschen.
--
-- Fehlerschlüssel: 42501 ohne Recht · 22023 `invalid_kind` · 22023 `invalid_path` ·
-- P0002 `session_not_found` / `asset_not_found`.
--
-- Test: supabase/tests/v6_session_grafiken.sql
-- =============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------- Rolle

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order)
values ('role', 'marketing_team', 'Marketing-Team', 'Marketing team', 21)
on conflict (vocabulary, key) do nothing;

/** Wer Bilder am Auftritt pflegt: Marketing, Programm-Team, Admin. */
create or replace function is_marketing_team() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select has_role('admin') or has_role('marketing_team') or has_role('programme_team')
$$;
grant execute on function is_marketing_team() to authenticated;

-- ---------------------------------------------------------------- Tabelle

create table if not exists session_asset (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references session (id) on delete cascade,
  -- Nur zwei Arten. Die Speaker-Grafik gehört bewusst nicht hierher (siehe Kopf).
  kind         text not null check (kind in ('stage_photo', 'slot_graphic')),
  storage_path text not null unique,
  filename     text not null,
  mime         text,
  size_bytes   bigint,
  width        integer,
  height       integer,
  -- Freistellung: bei der Slot-Grafik erwartet, beim Bühnenfoto nie (es ist ein
  -- Pressefoto). Als Kennzeichen, nicht als Automatik — freigestellt wird
  -- ausserhalb, hier steht nur, ob es geschehen ist.
  cutout       boolean not null default false,
  credit       text,
  version      integer not null default 1,
  is_current   boolean not null default true,
  uploaded_by  uuid references person (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists session_asset_session_idx on session_asset (session_id, kind, is_current);
drop trigger if exists trg_session_asset_updated on session_asset;
create trigger trg_session_asset_updated before update on session_asset
  for each row execute function set_updated_at();
comment on table session_asset is
  'Bilder, die an einem Auftritt haengen: Buehnenfoto und Slot-Grafik (0111). Die Speaker-Grafik gehoert an den Menschen und bleibt in speaker_asset.';

alter table session_asset enable row level security;
revoke all on session_asset from anon;
revoke insert, update, delete on session_asset from authenticated;
grant select on session_asset to authenticated;

drop policy if exists session_asset_read on session_asset;
create policy session_asset_read on session_asset for select to authenticated
using (
  is_marketing_team()
  or can_edit_session(session_id)
  -- Der Speaker sieht die Bilder seiner eigenen Auftritte.
  or exists (select 1 from session_speaker ss
              where ss.session_id = session_asset.session_id
                and ss.person_id = current_person_id())
);

-- ---------------------------------------------------------------- Bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('session-assets', 'session-assets', false, 26214400,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

/**
 * Pfadregel `<session_id>/<kind>/<datei>`.
 *
 * Gelesen wird über signierte URLs, die der Server erzeugt; die Policy hier
 * deckt den direkten Zugriff ab. Schreiben darf nur, wer die Bilder pflegt —
 * der Speaker sieht seine Fotos, lädt aber keine hoch.
 */
create or replace function session_asset_path_allowed(p_name text, p_write boolean default false)
returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_session uuid;
begin
  if current_person_id() is null or p_name is null then return false; end if;
  begin
    v_session := split_part(p_name, '/', 1)::uuid;
  exception when others then return false; end;
  if split_part(p_name, '/', 2) not in ('stage_photo', 'slot_graphic') then return false; end if;
  if split_part(p_name, '/', 3) = '' then return false; end if;
  if not exists (select 1 from session se where se.id = v_session) then return false; end if;
  if p_write then return is_marketing_team(); end if;
  return is_marketing_team()
      or can_edit_session(v_session)
      or exists (select 1 from session_speaker ss
                  where ss.session_id = v_session and ss.person_id = current_person_id());
end $$;
revoke execute on function session_asset_path_allowed(text, boolean) from public, anon;
grant execute on function session_asset_path_allowed(text, boolean) to authenticated;

drop policy if exists "session assets read" on storage.objects;
create policy "session assets read" on storage.objects for select to authenticated
using (bucket_id = 'session-assets' and session_asset_path_allowed(name));
drop policy if exists "session assets insert" on storage.objects;
create policy "session assets insert" on storage.objects for insert to authenticated
with check (bucket_id = 'session-assets' and session_asset_path_allowed(name, true));

-- ---------------------------------------------------------------- Mail

insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active
from (values
  ('stage_photos_ready', 'de', 1, 'Deine Fotos von „{{session_title}}" sind da',
   E'Hallo {{first_name}},\n\ndie Fotos von deinem Auftritt **{{session_title}}** stehen jetzt in deinem Portal.\n\n[Fotos ansehen]({{portal_url}}/speaker/session)\n\nDu darfst sie für dich verwenden — ein Hinweis auf den Future Leaders Summit freut uns.\n\nViele Grüße\nChefTreff',
   'Erstes Buehnenfoto einer Session steht bereit', true),
  ('stage_photos_ready', 'en', 1, 'Your photos from "{{session_title}}" are ready',
   E'Hi {{first_name}},\n\nthe photos from your session **{{session_title}}** are now in your portal.\n\n[View photos]({{portal_url}}/speaker/session)\n\nFeel free to use them — a mention of the Future Leaders Summit is appreciated.\n\nBest\nChefTreff',
   'First stage photo of a session is ready', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

-- ---------------------------------------------------------------- Schreiben

/**
 * Ein Bild eintragen, nachdem es im Bucket liegt.
 *
 * Ein zweites Bild derselben Art **ersetzt** nicht: beide bleiben, das ältere
 * verliert `is_current`. Bei Bühnenfotos ist das der Normalfall — es gibt
 * mehrere je Auftritt —, deshalb setzt nur die Slot-Grafik den Vorgänger
 * zurück. Zwei gültige Programmgrafiken wären eine Frage an die Event-App,
 * die niemand beantworten kann.
 */
create or replace function register_session_asset(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_session uuid := nullif(p_data->>'session_id', '')::uuid;
        v_kind text := nullif(p_data->>'kind', '');
        v_path text := nullif(btrim(p_data->>'storage_path'), '');
        v_id uuid; v_version integer; v_erstes boolean; r record;
begin
  if not is_marketing_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_kind not in ('stage_photo', 'slot_graphic') then
    raise exception 'invalid_kind' using errcode = '22023', detail = coalesce(v_kind, 'null');
  end if;
  if not exists (select 1 from session se where se.id = v_session) then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  -- Der Pfad muss zur Session gehören. Sonst zeigte die Zeile auf ein Bild,
  -- das jemand anderem gehört.
  if v_path is null or split_part(v_path, '/', 1) <> v_session::text
     or split_part(v_path, '/', 2) <> v_kind then
    raise exception 'invalid_path' using errcode = '22023', detail = coalesce(v_path, 'null');
  end if;

  v_erstes := not exists (select 1 from session_asset a
                           where a.session_id = v_session and a.kind = 'stage_photo');
  select coalesce(max(a.version), 0) + 1 into v_version
    from session_asset a where a.session_id = v_session and a.kind = v_kind;

  if v_kind = 'slot_graphic' then
    update session_asset set is_current = false
     where session_id = v_session and kind = 'slot_graphic' and is_current;
  end if;

  insert into session_asset (session_id, kind, storage_path, filename, mime, size_bytes,
                             width, height, cutout, credit, version, uploaded_by)
  values (v_session, v_kind, v_path, coalesce(nullif(btrim(p_data->>'filename'), ''), 'datei'),
          nullif(p_data->>'mime', ''), (p_data->>'size_bytes')::bigint,
          (p_data->>'width')::integer, (p_data->>'height')::integer,
          coalesce((p_data->>'cutout')::boolean, false),
          nullif(btrim(p_data->>'credit'), ''), v_version, current_person_id())
  returning id into v_id;

  -- Beim ersten Bühnenfoto einer Session: einmal Bescheid sagen, allen
  -- Speakern darauf. Beim zweiten nicht mehr.
  if v_kind = 'stage_photo' and v_erstes then
    for r in
      select ss.person_id, coalesce(se.title_de, se.title_en) as titel
        from session_speaker ss join session se on se.id = ss.session_id
       where ss.session_id = v_session
    loop
      -- Nur `session_title`: `portal_url` ergänzt die Warteschlange selbst
      -- (`lib/mail/queue.ts`), eigene Variablen nicht. Ein relativer Link wäre
      -- im Postfach tot (Review Architektur-Session 17.09.).
      perform queue_mail('stage_photos_ready', r.person_id,
                         jsonb_build_object('session_title', coalesce(r.titel, '')),
                         'session', v_session);
    end loop;
  end if;

  perform log_audit('session_asset.register', 'session_asset', v_id::text, null,
                    jsonb_build_object('session_id', v_session, 'kind', v_kind, 'version', v_version));
  return v_id;
end $$;

/** Bildunterschrift, Freistellungskennzeichen und Gültigkeit nachziehen. */
create or replace function set_session_asset(p_id uuid, p_data jsonb) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_before jsonb;
begin
  if not is_marketing_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select to_jsonb(a) into v_before from session_asset a where a.id = p_id;
  if v_before is null then raise exception 'asset_not_found' using errcode = 'P0002'; end if;
  update session_asset set
    credit     = case when p_data ? 'credit' then nullif(btrim(p_data->>'credit'), '') else credit end,
    cutout     = coalesce((p_data->>'cutout')::boolean, cutout),
    is_current = coalesce((p_data->>'is_current')::boolean, is_current)
  where id = p_id;
  perform log_audit('session_asset.update', 'session_asset', p_id::text, v_before, p_data);
end $$;

/**
 * Hart löschen — nur Admin.
 *
 * Das Marketing ersetzt; wirklich weg muss ein Bild nur, wenn es falsch ist
 * oder jemand widerspricht. Die Datei im Bucket räumt die Serverroute, die
 * Zeile geht hier.
 */
create or replace function delete_session_asset(p_id uuid) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_before jsonb; v_path text;
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  select to_jsonb(a), a.storage_path into v_before, v_path from session_asset a where a.id = p_id;
  if v_before is null then raise exception 'asset_not_found' using errcode = 'P0002'; end if;
  delete from session_asset where id = p_id;
  perform log_audit('session_asset.delete', 'session_asset', p_id::text, v_before, null);
  return v_path;
end $$;

-- ---------------------------------------------------------------- Lesen

/** Alle Bilder einer Edition für die Pflegeseite. */
create or replace function session_assets_admin(p_event_id uuid default null)
returns table (id uuid, session_id uuid, session_title text, stage_name text, start_at timestamptz,
               kind text, storage_path text, filename text, cutout boolean, credit text,
               version integer, is_current boolean, uploaded_by_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ev uuid;
begin
  if not is_marketing_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_event_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ev;
  return query
    select a.id, a.session_id, coalesce(se.title_de, se.title_en), st.name, sl.start_at,
           a.kind, a.storage_path, a.filename, a.cutout, a.credit, a.version, a.is_current,
           (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
              from person p where p.id = a.uploaded_by),
           a.created_at
      from session_asset a
      join session se on se.id = a.session_id
      join event e on e.id = se.event_id
      left join slot sl on sl.id = se.slot_id
      left join stage st on st.id = sl.stage_id
     where e.edition_id = v_ev or e.id = v_ev
     order by sl.start_at nulls last, a.kind, a.version desc;
end $$;

/**
 * Die Sessions einer Edition mit der Zahl ihrer Bilder — die Arbeitsliste des
 * Marketings: **wo fehlt noch was.**
 */
create or replace function sessions_for_assets(p_event_id uuid default null)
returns table (session_id uuid, title text, stage_name text, start_at timestamptz,
               speakers text, photos integer, graphics integer)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ev uuid;
begin
  if not is_marketing_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(p_event_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ev;
  return query
    select se.id, coalesce(se.title_de, se.title_en), st.name, sl.start_at,
           (select string_agg(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), ', ')
              from session_speaker ss join person p on p.id = ss.person_id
             where ss.session_id = se.id),
           (select count(*)::integer from session_asset a
             where a.session_id = se.id and a.kind = 'stage_photo'),
           (select count(*)::integer from session_asset a
             where a.session_id = se.id and a.kind = 'slot_graphic' and a.is_current)
      from session se
      join event e on e.id = se.event_id
      left join slot sl on sl.id = se.slot_id
      left join stage st on st.id = sl.stage_id
     where e.edition_id = v_ev or e.id = v_ev
     order by sl.start_at nulls last, se.title_de;
end $$;

/**
 * Die Fotos der **eigenen** Auftritte.
 *
 * Über `session_speaker`, nicht über das Speaker-Profil: massgeblich ist, wer
 * auf der Bühne stand. Die signierte URL erzeugt der Server aus dem Pfad — die
 * Datenbank gibt keine Links heraus, die länger gelten als die Anfrage.
 */
create or replace function my_session_photos()
returns table (id uuid, session_id uuid, session_title text, start_at timestamptz,
               storage_path text, filename text, credit text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select a.id, a.session_id, coalesce(se.title_de, se.title_en), sl.start_at,
           a.storage_path, a.filename, a.credit, a.created_at
      from session_asset a
      join session se on se.id = a.session_id
      join session_speaker ss on ss.session_id = se.id and ss.person_id = v_me
      left join slot sl on sl.id = se.slot_id
     where a.kind = 'stage_photo' and a.is_current
     order by sl.start_at nulls last, a.created_at;
end $$;

select harden_definer_functions();
