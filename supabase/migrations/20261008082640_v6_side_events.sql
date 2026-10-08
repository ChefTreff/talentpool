-- 0270 · Side Events: aus der Reception wird eine Einladungsliste (ADM-077, SPK-091)
-- Angewendet von der Architektur-Session am 08.10.2026 als 20261008082640.
-- NNNN · Side Events: aus der Reception wird eine Einladungsliste (ADM-077, SPK-091, Konrad und Paulina 05.10.2026)
--
-- Anlass: Feedbackrunde 05.10. — „Reception“ wird „Side Events“: mehrere speakerrelevante Veranstaltungen je Edition, Speaker
-- werden **eingeladen** (Status eingeladen / zugesagt / abgesagt, von Hand setzbar, wenn mündlich zugesagt), die Einladung kommt per
-- E-Mail mit **One-Click-Zusage**, und das Event steht im Speaker-Portal. Das löst `speaker_profile.reception_eligible` und die
-- Reception-Anmeldung (SPK-003, 0125) ab.
--
-- Datenmodell mit Plan abgestimmt (05.10.2026, `docs/entscheidungen.md`: „ADM-077/SPK-091 Side Events“). **Umbau statt Neubau:**
--   1  `speaker_reception` → `side_event`, `speaker_reception_rsvp` → `side_event_invite` (Umbenennen; live nur TEST-Zeilen).
--      Die Einladung ist eine **Zeile**: Status `invited | yes | no`, `via` (`portal | email | team` — wie der Stand zustande kam),
--      `invited_at/by`, `token_hash` (sha256 von 32 Zufallsbytes, **nie** Klartext), `guests` 0–3 (die Begleitung belegt einen Platz).
--      Die Kapazität zählt nur Zusagen plus Begleitung. Sichtbar ist ein Event nur mit Einladung **und** Veröffentlichung.
--   2  Die sieben Reception-Funktionen werden ersetzt durch `my_side_events`, `side_events_admin`, `upsert_side_event`,
--      `delete_side_event`, `respond_side_event`, `invite_to_side_event`, `set_side_event_status` und `side_event_respond_by_token`
--      (nur service_role); dazu der Helfer `side_event_taken` (Umbenennung von `reception_taken`).
--   3  **One-Click-Zusage:** Mail über die Speaker-Mail-Weiche mit Link `/side-event/<token>`; die öffentliche Seite zeigt keine
--      personenbezogenen Daten und setzt den Stand **nur per POST** (Mail-Scanner rufen Links vorab ab). Token 32 Zufallsbytes, gültig
--      bis Eventbeginn, idempotent; eine **neue Mail rotiert den Token** (der alte Link ist tot). Rate-Limit je Quelle wie bei der
--      Award-Abstimmung (`award_hash` mit Salz, die IP erreicht die Datenbank nie im Klartext).
--   4  Admin-Abschnitt `reception` → `sideEvents` (`/admin/side-events`, die alte Adresse leitet um); `admin_section_role` zieht mit.
--   5  `reception_eligible` bleibt als veraltete Spalte stehen. Backfill: wer berechtigt war, bekommt eine Einladung im Stand `invited`
--      (ohne Mail — das waren Berechtigte, keine Eingeladenen).
--   6  Platzhaltertext im Portal: `deadline`-Schlüssel `side_events_publish` (gepflegt unter /admin/fristen, kein neues Modell).
--
-- Auslegungen und Zusätze, die nicht wörtlich abgestimmt waren — **bitte im Review entscheiden**:
--   A  `rsvp_deadline` bleibt als **Antwortfrist** erhalten. Antworten (Portal und Link) gelten **bis Eventbeginn** — oder bis zur
--      Frist, falls das Team eine gesetzt hat (dann ist sie die strengere Grenze). Das Team setzt den Stand von Hand auch danach.
--   B  `side_events_admin` hat zwei Modi: ohne `p_side_event_id` nur Zahlen, **mit** zusätzlich die Einladungen dieses Events (Namen,
--      Hinweise) — Personendaten kommen auf Klick, nicht mit der Seite (wie früher `reception_guests`).
--   C  Der Token steht für den Versand in `mail_log.meta.vars` (die Vorlage rendert erst beim Versand). `lib/mail/queue.ts` entfernt ihn
--      **nach dem Versand**, `invite_to_side_event` sofort bei einer unterdrückten Adresse; solange die Mail wartet, ersetzt eine
--      neue Einladung den Token **in** der wartenden Mail, statt eine zweite mit totem Link zu schicken.
--   D  `anonymize_person` leert den Hinweis (`note`) an den Einladungen der Profile der Person — Freitext, der „Profil löschen“ nicht
--      überleben darf (Unverträglichkeit, Begleitung); Stand, Zeitpunkte und Anzahl bleiben.
--   E  Einladungen gehen nur zu **veröffentlichten** Events und nur an bestätigte Speaker ohne Partner-Gast (`not_eligible`); eine
--      Zu- oder Absage ändert die Einladung nur der Speaker selbst — eine Assistenz bekommt 42501 (wie im Portal schon).
--
-- Fehlerschlüssel: 28000 · 42501 · P0002 `side_event_not_found` · 22023 `invalid_side_event` (+ detail), `fields_required`, `too_long`
-- · P0001 `side_event_not_invited`, `side_event_not_published`, `side_event_closed` (detail = Frist), `side_event_full` (detail = freie
-- Plätze), `not_eligible` (detail). `side_event_respond_by_token` meldet **Zustände als Wert** (`ok`, `invalid`, `closed`, `full`,
-- `rate_limited`), keine Fehler.
set search_path = public, extensions;

-- === 1 · Umbenennen ====================================================================================================
alter table speaker_reception rename to side_event;
alter table speaker_reception_rsvp rename to side_event_invite;
alter table side_event_invite rename column reception_id to side_event_id;

do $$
declare r record;
begin
  -- Namen, die den alten Tabellennamen tragen: Einschränkungen, Index, Trigger. Nur umbenennen, was es gibt.
  for r in
    select * from (values
      ('side_event', 'reception_capacity_chk', 'side_event_capacity_chk'),
      ('side_event', 'reception_ends_chk', 'side_event_ends_chk'),
      ('side_event', 'speaker_reception_pkey', 'side_event_pkey'),
      ('side_event', 'speaker_reception_edition_id_fkey', 'side_event_edition_id_fkey'),
      ('side_event', 'speaker_reception_created_by_fkey', 'side_event_created_by_fkey'),
      ('side_event_invite', 'reception_rsvp_guests_chk', 'side_event_invite_guests_chk'),
      ('side_event_invite', 'speaker_reception_rsvp_pkey', 'side_event_invite_pkey'),
      ('side_event_invite', 'speaker_reception_rsvp_reception_id_fkey', 'side_event_invite_side_event_id_fkey'),
      ('side_event_invite', 'speaker_reception_rsvp_profile_id_fkey', 'side_event_invite_profile_id_fkey')
    ) as v(tabelle, alt, neu)
  loop
    if exists (select 1 from pg_constraint c where c.conrelid = to_regclass(r.tabelle) and c.conname = r.alt) then
      execute format('alter table %I rename constraint %I to %I', r.tabelle, r.alt, r.neu);
    end if;
  end loop;
  if to_regclass('speaker_reception_edition_idx') is not null then
    alter index speaker_reception_edition_idx rename to side_event_edition_idx;
  end if;
  if exists (select 1 from pg_trigger t where t.tgname = 'trg_speaker_reception_touch' and t.tgrelid = to_regclass('side_event')) then
    alter trigger trg_speaker_reception_touch on side_event rename to trg_side_event_touch;
  end if;
  if exists (select 1 from pg_trigger t where t.tgname = 'trg_reception_rsvp_touch' and t.tgrelid = to_regclass('side_event_invite')) then
    alter trigger trg_reception_rsvp_touch on side_event_invite rename to trg_side_event_invite_touch;
  end if;
end $$;

comment on table side_event is
  'Side Event je Edition (ADM-077): Zeit, Ort, Beschreibung, Obergrenze. Eingeladen wird über side_event_invite; sichtbar ist es für Speaker nur mit Einladung und wenn veröffentlicht. Löst die Speaker Reception (0125) ab.';
comment on column side_event.capacity is
  'Obergrenze in **Plätzen**, nicht Zusagen — eine Begleitung belegt einen zweiten; gezählt werden nur Zusagen. NULL = unbegrenzt.';
comment on column side_event.rsvp_deadline is
  'Antwortfrist (optional): Antworten gelten bis Eventbeginn oder, wenn gesetzt, bis zu dieser Frist — die strengere Grenze gilt. Das Team setzt den Stand von Hand auch danach.';

-- === 2 · Die Einladung ==================================================================================================
-- Eine Einladung hat noch keine Antwort: `responded_at` ist dann leer. Der Default fällt weg — „wann geantwortet“ ist eine Aussage
-- über die Person und nicht über die Zeile.
alter table side_event_invite alter column responded_at drop not null;
alter table side_event_invite alter column responded_at drop default;
alter table side_event_invite alter column status set default 'invited';
alter table side_event_invite drop constraint if exists reception_rsvp_status_chk;
alter table side_event_invite add constraint side_event_invite_status_chk check (status in ('invited', 'yes', 'no'));

alter table side_event_invite
  add column if not exists via text not null default 'portal',
  add column if not exists invited_at timestamptz,
  add column if not exists invited_by uuid references person (id),
  add column if not exists token_hash text,
  add column if not exists mailed_at timestamptz;
alter table side_event_invite add constraint side_event_invite_via_chk check (via in ('portal', 'email', 'team'));
alter table side_event_invite add constraint side_event_invite_token_chk check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$');
create unique index if not exists side_event_invite_token_uidx on side_event_invite (token_hash) where token_hash is not null;
create index if not exists side_event_invite_profile_idx on side_event_invite (profile_id);

comment on table side_event_invite is
  'Einladung eines Speaker-Profils zu einem Side Event (ADM-077): eine Zeile je Profil, Status invited/yes/no. Eine Absage bleibt stehen, damit das Team „abgesagt“ von „nie geantwortet“ unterscheidet. Ohne Grants — gelesen und geschrieben wird über die RPCs.';
comment on column side_event_invite.via is
  'Wie der Stand zustande kam: portal (der Speaker im Portal), email (One-Click-Link), team (von Hand gesetzt, auch eine neu angelegte Einladung).';
comment on column side_event_invite.token_hash is
  'sha256 (hex) des One-Click-Tokens aus der Einladungsmail — 32 Zufallsbytes, nie Klartext. Eine neue Einladungsmail ersetzt ihn (der alte Link ist dann tot). Gültig bis Eventbeginn.';
comment on column side_event_invite.mailed_at is
  'Wann die Einladungsmail in die Warteschlange kam (nicht: wann sie ankam — das steht im Mail-Protokoll).';
comment on column side_event_invite.note is
  'Hinweis des Speakers (Unverträglichkeit, Begleitung): Freitext, geht mit „Profil löschen“ weg (anonymize_person).';

-- Wer schon eine Zu- oder Absage hatte, wurde damals eingeladen: Zeitpunkt der ersten Zeile.
update side_event_invite set invited_at = created_at where invited_at is null;
-- Wer berechtigt war, aber nie geantwortet hat, bekommt die Einladung als Zeile — ohne Mail (das waren Berechtigte, keine Eingeladenen).
insert into side_event_invite (side_event_id, profile_id, status, guests, via, invited_at, responded_at)
select e.id, sp.id, 'invited', 0, 'team', now(), null
  from side_event e
  join speaker_profile sp on sp.edition_id = e.edition_id and sp.reception_eligible and not sp.stage_guest
 where not exists (select 1 from side_event_invite i where i.side_event_id = e.id and i.profile_id = sp.id);
-- Jede Einladung hat einen Zeitpunkt — die Funktionen setzen ihn, ein Direktzugriff gibt es nicht.
alter table side_event_invite alter column invited_at set default now();
alter table side_event_invite alter column invited_at set not null;

-- Versuche an der öffentlichen Link-Seite, je Quelle (gesalzener Hash, nie die Adresse) — nur für die Ratenbegrenzung.
create table if not exists side_event_attempt (
  source_hash text not null,
  created_at  timestamptz not null default now()
);
create index if not exists side_event_attempt_idx on side_event_attempt (source_hash, created_at);
comment on table side_event_attempt is
  'Anfragen an die öffentliche Seite /side-event/<token> je Quelle (award_hash, gesalzen) — Grundlage der Ratenbegrenzung; Zeilen älter als ein Tag räumt die Funktion selbst weg. Keine Grants.';
alter table side_event_attempt enable row level security;
revoke all on side_event_attempt from anon, authenticated;
revoke all on side_event, side_event_invite from anon, authenticated;

-- === 3 · Vokabular ======================================================================================================
insert into vocab_term (vocabulary, key, label_de, label_en, sort_order) values
  ('side_event_status', 'invited', 'Eingeladen', 'Invited',       1),
  ('side_event_status', 'yes',     'Zugesagt',   'Attending',     2),
  ('side_event_status', 'no',      'Abgesagt',   'Not attending', 3)
on conflict (vocabulary, key) do nothing;

-- === 4 · Admin-Abschnitt: reception → sideEvents ========================================================================
-- Eine Zeile je Rolle plus `admin` (der Katalog); `tests/admin-sections.test.ts` hält das gegen `lib/admin-sections.ts`.
delete from admin_section_role where section = 'reception' and role = 'admin';
delete from admin_section_role where section = 'reception' and role = 'area_lead_speaker';
delete from admin_section_role where section = 'reception' and role = 'programme_team';
insert into admin_section_role (section, role) values
  ('sideEvents', 'admin'),
  ('sideEvents', 'area_lead_speaker'),
  ('sideEvents', 'programme_team');
-- Ausnahmen, die Konrad für den alten Abschnitt gesetzt hat (ADM-053), ziehen mit.
update admin_section_override set section = 'sideEvents' where section = 'reception';

-- === 5 · Die alten Funktionen =========================================================================================
drop function if exists my_receptions(uuid);
drop function if exists set_reception_rsvp(uuid, text, integer, text);
drop function if exists receptions_admin(uuid);
drop function if exists reception_guests(uuid);
drop function if exists upsert_reception(jsonb);
drop function if exists delete_reception(uuid);
drop function if exists reception_taken(uuid);

-- === 6 · Belegte Plätze ================================================================================================
/** Zusagen plus Begleitungen. Eine Absage gibt ihren Platz wieder frei; eine offene Einladung belegt keinen. */
create or replace function side_event_taken(p_side_event_id uuid) returns integer
 language sql stable security definer set search_path to 'public', 'extensions' as $$
  select coalesce(sum(1 + i.guests), 0)::integer
    from side_event_invite i
   where i.side_event_id = p_side_event_id and i.status = 'yes'
$$;
revoke execute on function side_event_taken(uuid) from public, anon, authenticated;

-- === 7 · Speaker: meine Einladungen ====================================================================================
create or replace function my_side_events(p_edition_id uuid default null)
 returns table(id uuid, title_de text, title_en text, description_de text, description_en text, location text, address text,
               starts_at timestamptz, ends_at timestamptz, capacity integer, taken integer, free integer, rsvp_deadline timestamptz,
               closed boolean, my_status text, my_guests integer, my_note text, invited_at timestamptz)
 language plpgsql stable security definer set search_path to 'public', 'extensions' as $$
declare v_profile uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_profile := my_speaker_profile_id(p_edition_id);
  if v_profile is null then return; end if;
  -- Nur, wer eingeladen ist, und nur Veröffentlichtes: ohne Einladung gibt es nichts zu sehen, auch keine Fehlermeldung, die verriete,
  -- dass es Side Events gibt.
  return query
    select e.id, e.title_de, e.title_en, e.description_de, e.description_en, e.location, e.address, e.starts_at, e.ends_at,
           e.capacity, side_event_taken(e.id),
           case when e.capacity is null then null else greatest(e.capacity - side_event_taken(e.id), 0) end,
           e.rsvp_deadline,
           e.starts_at <= now() or (e.rsvp_deadline is not null and now() > e.rsvp_deadline),
           i.status, i.guests, i.note, i.invited_at
      from side_event_invite i
      join side_event e on e.id = i.side_event_id
     where i.profile_id = v_profile and e.published
     order by e.starts_at;
end $$;

-- === 8 · Team: Übersicht ================================================================================================
create or replace function side_events_admin(p_edition_id uuid default null, p_side_event_id uuid default null)
 returns table(id uuid, edition_id uuid, title_de text, title_en text, description_de text, description_en text, location text,
               address text, starts_at timestamptz, ends_at timestamptz, capacity integer, rsvp_deadline timestamptz, published boolean,
               taken integer, yes_count integer, no_count integer, open_count integer, invited_count integer, invites jsonb)
 language plpgsql stable security definer set search_path to 'public', 'extensions' as $$
declare v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select coalesce(p_edition_id,
                  (select e.edition_id from side_event e where e.id = p_side_event_id),
                  (select ev.id from event ev where ev.is_edition order by ev.start_date desc limit 1))
    into v_ed;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;

  return query
    select e.id, e.edition_id, e.title_de, e.title_en, e.description_de, e.description_en, e.location, e.address, e.starts_at, e.ends_at,
           e.capacity, e.rsvp_deadline, e.published, side_event_taken(e.id),
           (select count(*)::integer from side_event_invite i where i.side_event_id = e.id and i.status = 'yes'),
           (select count(*)::integer from side_event_invite i where i.side_event_id = e.id and i.status = 'no'),
           (select count(*)::integer from side_event_invite i where i.side_event_id = e.id and i.status = 'invited'),
           (select count(*)::integer from side_event_invite i where i.side_event_id = e.id),
           -- Namen und Hinweise nur für das eine Event, das die Seite aufklappt (Modus B).
           case when p_side_event_id is not null and e.id = p_side_event_id then
             (select coalesce(jsonb_agg(jsonb_build_object(
                       'profile_id', i.profile_id, 'first_name', p.first_name, 'last_name', p.last_name, 'status', i.status,
                       'guests', i.guests, 'note', i.note, 'via', i.via, 'invited_at', i.invited_at, 'mailed_at', i.mailed_at,
                       'responded_at', i.responded_at)
                     order by case i.status when 'yes' then 0 when 'invited' then 1 else 2 end, p.last_name, p.first_name), '[]'::jsonb)
                from side_event_invite i
                join speaker_profile sp on sp.id = i.profile_id
                join person p on p.id = sp.person_id
               where i.side_event_id = e.id)
           end
      from side_event e
     where e.edition_id = v_ed
       and (p_side_event_id is null or e.id = p_side_event_id)
     order by e.starts_at;
end $$;

-- === 9 · Team: anlegen, ändern, löschen ===============================================================================
create or replace function upsert_side_event(p_data jsonb) returns uuid
 language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare v_id uuid; v_ed uuid; v_start timestamptz; v_end timestamptz; v_cap integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_id := nullif(p_data->>'id', '')::uuid;

  -- Beim Ändern gilt die Edition des Datensatzes, nicht die im Aufruf: sonst liesse sich über eine fremde `edition_id` ein Side Event
  -- übernehmen, für das man nicht zuständig ist (Lehre aus Review 0083).
  if v_id is not null then
    select e.edition_id into v_ed from side_event e where e.id = v_id;
    if v_ed is null then raise exception 'side_event_not_found' using errcode = 'P0002'; end if;
  else
    select coalesce(nullif(p_data->>'edition_id', '')::uuid,
                    (select ev.id from event ev where ev.is_edition order by ev.start_date desc limit 1))
      into v_ed;
  end if;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_start := nullif(btrim(p_data->>'starts_at'), '')::timestamptz;
  v_end   := nullif(btrim(p_data->>'ends_at'), '')::timestamptz;
  v_cap   := nullif(btrim(p_data->>'capacity'), '')::integer;
  if v_cap is not null and v_cap <= 0 then
    raise exception 'invalid_side_event' using errcode = '22023', detail = 'capacity:' || v_cap::text;
  end if;
  if v_end is not null and v_start is not null and v_end < v_start then
    raise exception 'invalid_side_event' using errcode = '22023', detail = 'ends_at';
  end if;

  if v_id is null then
    if nullif(btrim(p_data->>'title_de'), '') is null
       or nullif(btrim(p_data->>'title_en'), '') is null
       or nullif(btrim(p_data->>'location'), '') is null
       or v_start is null then
      raise exception 'fields_required' using errcode = '22023', detail = 'title_de, title_en, location, starts_at';
    end if;
    insert into side_event (edition_id, title_de, title_en, description_de, description_en, location, address, starts_at, ends_at,
                            capacity, rsvp_deadline, published, created_by)
    values (v_ed, btrim(p_data->>'title_de'), btrim(p_data->>'title_en'),
            nullif(btrim(p_data->>'description_de'), ''), nullif(btrim(p_data->>'description_en'), ''),
            btrim(p_data->>'location'), nullif(btrim(p_data->>'address'), ''), v_start, v_end, v_cap,
            nullif(btrim(p_data->>'rsvp_deadline'), '')::timestamptz,
            coalesce((p_data->>'published')::boolean, false), current_person_id())
    returning id into v_id;
  else
    -- Teilupdate über die mitgeschickten Schlüssel: was fehlt, bleibt stehen.
    update side_event set
      title_de = coalesce(nullif(btrim(p_data->>'title_de'), ''), title_de),
      title_en = coalesce(nullif(btrim(p_data->>'title_en'), ''), title_en),
      description_de = case when p_data ? 'description_de' then nullif(btrim(p_data->>'description_de'), '') else description_de end,
      description_en = case when p_data ? 'description_en' then nullif(btrim(p_data->>'description_en'), '') else description_en end,
      location = coalesce(nullif(btrim(p_data->>'location'), ''), location),
      address = case when p_data ? 'address' then nullif(btrim(p_data->>'address'), '') else address end,
      starts_at = coalesce(v_start, starts_at),
      ends_at = case when p_data ? 'ends_at' then v_end else ends_at end,
      capacity = case when p_data ? 'capacity' then v_cap else capacity end,
      rsvp_deadline = case when p_data ? 'rsvp_deadline' then nullif(btrim(p_data->>'rsvp_deadline'), '')::timestamptz else rsvp_deadline end,
      published = coalesce((p_data->>'published')::boolean, published)
    where id = v_id;
  end if;

  perform log_audit('side_event.saved', 'side_event', v_id::text, null, p_data);
  return v_id;
end $$;

create or replace function delete_side_event(p_id uuid) returns void
 language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare v_ed uuid; v_n integer;
begin
  select e.edition_id into v_ed from side_event e where e.id = p_id;
  if v_ed is null then raise exception 'side_event_not_found' using errcode = 'P0002'; end if;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;

  -- Mit Zusagen löscht niemand von Versehen: erst die Zusagen klären (Stand ändern), dann löschen.
  select count(*)::integer into v_n from side_event_invite i where i.side_event_id = p_id and i.status = 'yes';
  if v_n > 0 then
    raise exception 'invalid_side_event' using errcode = '22023', detail = 'has_guests:' || v_n::text;
  end if;

  delete from side_event where id = p_id;   -- die Einladungen fallen mit
  perform log_audit('side_event.deleted', 'side_event', p_id::text, null, null);
end $$;

-- === 10 · Speaker: zu- oder absagen ====================================================================================
create or replace function respond_side_event(p_side_event_id uuid, p_status text, p_guests integer default 0, p_note text default null)
 returns jsonb
 language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  v_me uuid := current_person_id(); v_profile uuid; v_e side_event%rowtype; v_i side_event_invite%rowtype;
  v_guests integer := coalesce(p_guests, 0); v_note text := nullif(btrim(p_note), ''); v_eigene integer := 0; v_frei integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_status not in ('yes', 'no') then
    raise exception 'invalid_side_event' using errcode = '22023', detail = 'status:' || coalesce(p_status, 'null');
  end if;
  if v_guests < 0 or v_guests > 3 then
    raise exception 'invalid_side_event' using errcode = '22023', detail = 'guests:' || v_guests::text;
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'too_long' using errcode = '22023', detail = 'note';
  end if;

  select * into v_e from side_event where id = p_side_event_id;
  if not found or not v_e.published then raise exception 'side_event_not_found' using errcode = 'P0002'; end if;

  v_profile := my_speaker_profile_id(v_e.edition_id);
  if v_profile is null then raise exception 'side_event_not_invited' using errcode = 'P0001', detail = 'not_invited'; end if;
  select * into v_i from side_event_invite where side_event_id = p_side_event_id and profile_id = v_profile for update;
  if not found then raise exception 'side_event_not_invited' using errcode = 'P0001', detail = 'not_invited'; end if;
  -- Eine Zusage ist eine persönliche Entscheidung: nur der Speaker selbst, nicht seine Assistenz oder ein Kontakt mit Zugang.
  if not coalesce((select sp.person_id = v_me from speaker_profile sp where sp.id = v_profile), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_e.starts_at <= now() or (v_e.rsvp_deadline is not null and now() > v_e.rsvp_deadline) then
    raise exception 'side_event_closed' using errcode = 'P0001',
      detail = to_char(least(v_e.starts_at, coalesce(v_e.rsvp_deadline, v_e.starts_at)) at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI');
  end if;

  -- Die Obergrenze zählt Plätze; die eigene bisherige Zusage zählt beim Ändern nicht mit — sonst liesse sich eine Begleitung nie nachtragen.
  if p_status = 'yes' and v_e.capacity is not null then
    if v_i.status = 'yes' then v_eigene := 1 + v_i.guests; end if;
    v_frei := v_e.capacity - (side_event_taken(p_side_event_id) - v_eigene);
    if 1 + v_guests > v_frei then
      raise exception 'side_event_full' using errcode = 'P0001', detail = greatest(v_frei, 0)::text;
    end if;
  end if;

  update side_event_invite
     set status = p_status, guests = case when p_status = 'yes' then v_guests else 0 end,
         note = v_note, responded_at = now(), via = 'portal'
   where side_event_id = p_side_event_id and profile_id = v_profile;

  -- Ins Protokoll gehen Person, Stand und Platzzahl — nie der Freitext: was jemand als Hinweis schreibt, ist seine Sache.
  perform log_audit('side_event.responded', 'side_event', p_side_event_id::text, null,
    jsonb_build_object('person_id', v_me, 'status', p_status, 'guests', case when p_status = 'yes' then v_guests else 0 end, 'via', 'portal'));
  return jsonb_build_object('status', p_status, 'guests', case when p_status = 'yes' then v_guests else 0 end,
                            'taken', side_event_taken(p_side_event_id));
end $$;

-- === 11 · Team: einladen ==============================================================================================
create or replace function invite_to_side_event(p_side_event_id uuid, p_profile_ids uuid[], p_resend boolean default false)
 returns jsonb
 language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  v_me uuid := current_person_id(); v_e side_event%rowtype; v_pid uuid; v_sp speaker_profile%rowtype; v_i side_event_invite%rowtype;
  v_token text; v_hash text; v_an uuid; v_n integer; v_mail bigint; v_status text; v_gesendet boolean;
  v_eingeladen integer := 0; v_erneut integer := 0; v_uebersprungen jsonb := '[]'::jsonb; v_ohne_mail jsonb := '[]'::jsonb;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_e from side_event where id = p_side_event_id;
  if not found then raise exception 'side_event_not_found' using errcode = 'P0002'; end if;
  if not is_speaker_team(v_e.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Die Mail nennt Datum und Ort: eine Einladung zu etwas, das noch niemand sehen soll, wäre ein Leck.
  if not v_e.published then raise exception 'side_event_not_published' using errcode = 'P0001'; end if;
  if p_profile_ids is null or cardinality(p_profile_ids) = 0 then
    raise exception 'fields_required' using errcode = '22023', detail = 'profile_ids';
  end if;
  if cardinality(p_profile_ids) > 200 then
    raise exception 'invalid_side_event' using errcode = '22023', detail = 'profile_ids:' || cardinality(p_profile_ids)::text;
  end if;

  for v_pid in select distinct x from unnest(p_profile_ids) as x loop
    select * into v_sp from speaker_profile where id = v_pid;
    if not found or v_sp.edition_id <> v_e.edition_id or v_sp.stage_guest or not speaker_is_confirmed(v_sp.pipeline_status)
       or not exists (select 1 from person p where p.id = v_sp.person_id and p.deleted_at is null) then
      v_uebersprungen := v_uebersprungen || jsonb_build_object('profile_id', v_pid, 'reason', 'not_eligible');
      continue;
    end if;

    select * into v_i from side_event_invite where side_event_id = p_side_event_id and profile_id = v_pid for update;
    if found then
      if v_i.status <> 'invited' then
        v_uebersprungen := v_uebersprungen || jsonb_build_object('profile_id', v_pid, 'reason', 'answered');
        continue;
      end if;
      if not p_resend then
        v_uebersprungen := v_uebersprungen || jsonb_build_object('profile_id', v_pid, 'reason', 'already_invited');
        continue;
      end if;
    end if;

    -- Token: 32 Zufallsbytes, URL-sicher (43 Zeichen). Gespeichert wird nur der Hash; der Klartext geht ausschliesslich in die Mail.
    v_token := translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_');
    v_hash  := encode(digest(v_token, 'sha256'), 'hex');

    if v_i.profile_id is null then
      insert into side_event_invite (side_event_id, profile_id, status, guests, via, invited_at, invited_by, token_hash, mailed_at)
      values (p_side_event_id, v_pid, 'invited', 0, 'team', now(), v_me, v_hash, now());
      v_eingeladen := v_eingeladen + 1;
    else
      update side_event_invite set token_hash = v_hash, mailed_at = now(), invited_by = v_me
       where side_event_id = p_side_event_id and profile_id = v_pid;
      v_erneut := v_erneut + 1;
    end if;

    -- Die Mail geht an den Empfänger der Speaker-Mails (bei einem verwalteten Speaker an den Kontakt des Partners). Wartet noch eine
    -- Einladung für denselben Empfänger, bekommt **sie** den neuen Token: eine zweite Mail trüge einen schon toten Link.
    v_an := speaker_mail_recipient(v_pid);
    v_gesendet := true;
    update mail_log
       set meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{vars,side_event_token}', to_jsonb(v_token), true)
     where template_key = 'side_event_invitation' and related_id = p_side_event_id and person_id = v_an and status = 'queued';
    get diagnostics v_n = row_count;
    if v_n = 0 then
      v_mail := queue_speaker_mail('side_event_invitation', v_pid, jsonb_build_object(
        'event_title_de', v_e.title_de, 'event_title_en', v_e.title_en,
        'starts_at_de', to_char(v_e.starts_at at time zone 'Europe/Berlin', 'DD.MM.YYYY, HH24:MI "Uhr"'),
        'starts_at_en', to_char(v_e.starts_at at time zone 'Europe/Berlin', 'FMDD Mon YYYY, HH24:MI'),
        'event_location', v_e.location || coalesce(', ' || v_e.address, ''),
        'side_event_token', v_token), 'side_event', p_side_event_id);
      if v_mail is null then
        v_gesendet := false;   -- keine zustellbare Adresse
      else
        select m.status into v_status from mail_log m where m.id = v_mail;
        if v_status is distinct from 'queued' then
          -- Eine unterdrückte Adresse bekommt die Mail nie: der Token hat im Protokoll nichts zu suchen.
          update mail_log set meta = meta #- '{vars,side_event_token}' where id = v_mail;
          v_gesendet := false;
        end if;
      end if;
    end if;
    if not v_gesendet then
      -- Eingeladen ist die Person trotzdem (im Portal sichtbar), aber ohne Link: ein Hash, zu dem es keine Mail gibt, wäre ein
      -- Geheimnis, das niemand kennt. Das Team sieht es in `no_mail` und kann den Stand von Hand setzen.
      update side_event_invite set token_hash = null, mailed_at = null where side_event_id = p_side_event_id and profile_id = v_pid;
      v_ohne_mail := v_ohne_mail || to_jsonb(v_pid);
    end if;

    -- Ins Protokoll gehört die Person, nicht ihre Adresse.
    perform log_audit('side_event.invited', 'side_event', p_side_event_id::text, null,
      jsonb_build_object('person_id', v_sp.person_id, 'resend', v_i.profile_id is not null, 'mailed', v_gesendet));
  end loop;

  return jsonb_build_object('invited', v_eingeladen, 'resent', v_erneut, 'skipped', v_uebersprungen, 'no_mail', v_ohne_mail);
end $$;

-- === 12 · Team: Stand von Hand setzen =================================================================================
create or replace function set_side_event_status(p_side_event_id uuid, p_profile_id uuid, p_status text,
                                                 p_guests integer default null, p_note text default null)
 returns jsonb
 language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  v_me uuid := current_person_id(); v_e side_event%rowtype; v_sp speaker_profile%rowtype; v_i side_event_invite%rowtype;
  v_guests integer; v_note text := nullif(btrim(p_note), ''); v_eigene integer := 0; v_frei integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_e from side_event where id = p_side_event_id;
  if not found then raise exception 'side_event_not_found' using errcode = 'P0002'; end if;
  if not is_speaker_team(v_e.edition_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('invited', 'yes', 'no') then
    raise exception 'invalid_side_event' using errcode = '22023', detail = 'status:' || coalesce(p_status, 'null');
  end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'too_long' using errcode = '22023', detail = 'note'; end if;

  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found or v_sp.edition_id <> v_e.edition_id or v_sp.stage_guest or not speaker_is_confirmed(v_sp.pipeline_status) then
    raise exception 'not_eligible' using errcode = 'P0001', detail = 'side_event';
  end if;

  select * into v_i from side_event_invite where side_event_id = p_side_event_id and profile_id = p_profile_id for update;
  v_guests := case when p_status = 'yes' then coalesce(p_guests, case when found then v_i.guests else 0 end) else 0 end;
  if v_guests < 0 or v_guests > 3 then
    raise exception 'invalid_side_event' using errcode = '22023', detail = 'guests:' || v_guests::text;
  end if;

  -- Auch das Team kann nicht mehr Plätze vergeben, als es gibt — erst die Obergrenze ändern.
  if p_status = 'yes' and v_e.capacity is not null then
    if v_i.profile_id is not null and v_i.status = 'yes' then v_eigene := 1 + v_i.guests; end if;
    v_frei := v_e.capacity - (side_event_taken(p_side_event_id) - v_eigene);
    if 1 + v_guests > v_frei then
      raise exception 'side_event_full' using errcode = 'P0001', detail = greatest(v_frei, 0)::text;
    end if;
  end if;

  if v_i.profile_id is null then
    insert into side_event_invite (side_event_id, profile_id, status, guests, note, via, invited_at, invited_by, responded_at)
    values (p_side_event_id, p_profile_id, p_status, v_guests, v_note, 'team', now(), v_me,
            case when p_status = 'invited' then null else now() end);
  else
    -- `p_note` null lässt den Hinweis stehen, ein leerer Text löscht ihn (das Team darf einen Hinweis entfernen, den es nicht braucht).
    update side_event_invite
       set status = p_status, guests = v_guests, note = case when p_note is null then note else v_note end, via = 'team',
           responded_at = case when p_status = 'invited' then null else now() end
     where side_event_id = p_side_event_id and profile_id = p_profile_id;
  end if;

  perform log_audit('side_event.status_set', 'side_event', p_side_event_id::text, null,
    jsonb_build_object('person_id', v_sp.person_id, 'status', p_status, 'guests', v_guests, 'via', 'team'));
  return jsonb_build_object('status', p_status, 'guests', v_guests, 'taken', side_event_taken(p_side_event_id));
end $$;

-- === 13 · One-Click: der Link aus der Mail (nur der Server) ============================================================
/**
 * Die öffentliche Seite `/side-event/<token>` und ihre Antwort. **Nur service_role** — die Route prüft nichts außer der Form des
 * Tokens und reicht die gehashte Quelle durch (`quellHash`, wie bei der Award-Abstimmung).
 *
 * Ohne `p_status` nur lesen (die Seite zeigt Event und Stand — **ohne** Personendaten, **ohne** den Stand zu ändern: Mail-Scanner rufen
 * Links vorab ab). Mit `yes`/`no` setzen; derselbe Stand noch einmal ändert nichts (idempotent). Zustände kommen als Wert zurück:
 * `ok`, `invalid` (unbekannt, abgelaufen, unveröffentlicht — nicht unterscheidbar), `closed`, `full`, `rate_limited`.
 */
create or replace function side_event_respond_by_token(p_token text, p_status text default null, p_ip_hash text default null)
 returns jsonb
 language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  v_ed uuid; v_quelle text; v_hash text; v_e side_event%rowtype; v_i side_event_invite%rowtype; v_eigene integer := 0; v_frei integer;
  v_event jsonb;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('yes', 'no') then return jsonb_build_object('state', 'invalid'); end if;

  -- Ratenbegrenzung: höchstens 60 Anfragen je Quelle und Stunde (auch Lesen — der Link ist ein Geheimnis, kein Hobby). Ohne gültige
  -- Quelle antworten wir nicht: lieber keine Antwort als eine, die sich nicht begrenzen lässt.
  select ev.id into v_ed from event ev where ev.is_edition order by ev.start_date desc limit 1;
  if v_ed is null then return jsonb_build_object('state', 'invalid'); end if;
  v_quelle := award_hash(v_ed, p_ip_hash);
  if v_quelle is null then return jsonb_build_object('state', 'invalid'); end if;
  delete from side_event_attempt where created_at < now() - interval '1 day';
  if (select count(*) from side_event_attempt a where a.source_hash = v_quelle and a.created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('state', 'rate_limited');
  end if;
  insert into side_event_attempt (source_hash) values (v_quelle);

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return jsonb_build_object('state', 'invalid'); end if;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');
  select i.* into v_i from side_event_invite i where i.token_hash = v_hash for update;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  select * into v_e from side_event where id = v_i.side_event_id;
  -- Gültig bis Eventbeginn, und nur solange das Event veröffentlicht ist.
  if not v_e.published or v_e.starts_at <= now() then return jsonb_build_object('state', 'invalid'); end if;

  v_event := jsonb_build_object('title_de', v_e.title_de, 'title_en', v_e.title_en, 'starts_at', v_e.starts_at, 'ends_at', v_e.ends_at,
                                'location', v_e.location, 'address', v_e.address);
  if p_status is null then
    return jsonb_build_object('state', case when v_e.rsvp_deadline is not null and now() > v_e.rsvp_deadline then 'closed' else 'ok' end,
                              'status', v_i.status, 'event', v_event);
  end if;
  if v_e.rsvp_deadline is not null and now() > v_e.rsvp_deadline then
    return jsonb_build_object('state', 'closed', 'status', v_i.status, 'event', v_event);
  end if;
  -- Derselbe Stand noch einmal: nichts schreiben, nichts protokollieren — ein doppelter Klick ist kein zweites Ereignis.
  if v_i.status = p_status then
    return jsonb_build_object('state', 'ok', 'status', v_i.status, 'event', v_event);
  end if;

  if p_status = 'yes' and v_e.capacity is not null then
    if v_i.status = 'yes' then v_eigene := 1 + v_i.guests; end if;
    v_frei := v_e.capacity - (side_event_taken(v_e.id) - v_eigene);
    if 1 + v_i.guests > v_frei then
      return jsonb_build_object('state', 'full', 'status', v_i.status, 'event', v_event);
    end if;
  end if;

  update side_event_invite
     set status = p_status, guests = case when p_status = 'yes' then guests else 0 end, responded_at = now(), via = 'email'
   where side_event_id = v_i.side_event_id and profile_id = v_i.profile_id;
  perform log_audit('side_event.responded', 'side_event', v_e.id::text, null,
    jsonb_build_object('person_id', (select sp.person_id from speaker_profile sp where sp.id = v_i.profile_id),
                       'status', p_status, 'via', 'email', 'responded_at', now()));
  return jsonb_build_object('state', 'ok', 'status', p_status, 'event', v_event);
end $$;
revoke execute on function side_event_respond_by_token(text, text, text) from public, anon, authenticated;
grant execute on function side_event_respond_by_token(text, text, text) to service_role;

-- === 14 · Mail: die Einladung ==========================================================================================
-- Variablen: `event_title_de/en`, `starts_at_de/en`, `event_location`, `side_event_token` (nur bis zum Versand im Protokoll — siehe C
-- oben); der Link entsteht aus `{{portal_url}}` und dem Token. Die Sprache bestimmt `queue_mail` (Speaker: Englisch, falls nicht anders).
insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active from (values
  ('side_event_invitation', 'de', 1, 'Einladung: {{event_title_de}}',
   E'Hallo {{first_name}},\n\nwir laden dich zu **{{event_title_de}}** ein.\n\n**Wann:** {{starts_at_de}}\n**Wo:** {{event_location}}\n\n[Ich komme — Zu- oder Absage in einem Klick]({{portal_url}}/side-event/{{side_event_token}})\n\nDer Link führt auf eine Seite, auf der du ohne Anmeldung zu- oder absagst. Deine Antwort kannst du bis zum Beginn jederzeit im [Speaker-Portal]({{portal_url}}/speaker) ändern.\n\nViele Grüße\nChefTreff',
   'Einladung zu einem Side Event mit One-Click-Link (an den Speaker oder seinen Kontakt)', true),
  ('side_event_invitation', 'en', 1, 'Invitation: {{event_title_en}}',
   E'Hi {{first_name}},\n\nwe would like to invite you to **{{event_title_en}}**.\n\n**When:** {{starts_at_en}}\n**Where:** {{event_location}}\n\n[I''ll be there — accept or decline in one click]({{portal_url}}/side-event/{{side_event_token}})\n\nThe link opens a page where you accept or decline without signing in. You can change your answer any time until the start in the [speaker portal]({{portal_url}}/speaker).\n\nBest,\nChefTreff',
   'Invitation to a side event with one-click link (to the speaker or their contact)', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

-- === 15 · Löschweg: der Hinweis geht mit dem Profil (aus dem Snapshot) ===================================================
create or replace function anonymize_person(p_person_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_hash text; v_profile uuid[];
begin
  if p_person_id is null then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  perform log_audit('profile.delete', 'person', p_person_id::text, null, null);

  select array_agg(sp.id) into v_profile from speaker_profile sp where sp.person_id = p_person_id;
  v_profile := coalesce(v_profile, '{}');

  -- 1 · Sperrliste. Der Hash bleibt, die Adresse geht.
  insert into suppression (email_hash, reason)
    select email_hash(email::text), 'profile_deleted' from person_email where person_id = p_person_id
  on conflict (email_hash) do nothing;
  select email_hash(pe.email::text) into v_hash
    from person_email pe where pe.person_id = p_person_id and pe.is_primary;

  -- 2 · Dateien zum Wegräumen anmelden, **bevor** die Zeilen fallen: danach
  --     wüsste niemand mehr, welche Pfade gemeint waren.
  insert into storage_purge_queue (bucket, path)
    select 'speaker-assets', sa.storage_path from speaker_asset sa where sa.profile_id = any (v_profile)
  on conflict (bucket, path) do nothing;
  -- Porträt aus dem Teilnehmer-Profil (TAL-012).
  insert into storage_purge_queue (bucket, path)
    select 'person-photos', p.photo_path from person p
     where p.id = p_person_id and p.photo_path is not null
  on conflict (bucket, path) do nothing;
  -- Lebenslauf aus dem Teilnehmer-Profil (TAL-013, B3).
  insert into storage_purge_queue (bucket, path)
    select 'person-cv', p.cv_path from person p
     where p.id = p_person_id and p.cv_path is not null
  on conflict (bucket, path) do nothing;

  -- 3 · Zeilen, die ohne die Person keinen Sinn mehr haben.
  delete from person_interest            where person_id = p_person_id;
  delete from person_acquisition_channel where person_id = p_person_id;
  delete from person_language            where person_id = p_person_id;
  delete from role_assignment            where person_id = p_person_id;
  -- Ansprechperson einer Organisation kann nur sein, wen es gibt.
  delete from org_membership             where person_id = p_person_id;
  delete from speaker_asset  where profile_id = any (v_profile);
  -- Anreise ist reine Logistik eines vergangenen Termins: Flugnummer, Ankunft,
  -- Notiz. Nichts davon trägt eine Zahl, die später jemand braucht.
  delete from speaker_travel where profile_id = any (v_profile);

  -- 4 · Die Person selbst. Grobe Merkmale bleiben für die Statistik
  --     (career_level, study_field, country, tier, occupation_status) — sie
  --     beschreiben eine Gruppe, keinen Menschen. Freitext, Kontaktdaten und
  --     alles nach Art. 9 DSGVO (Ernährung, Geschlecht) fällt weg.
  update person set
    first_name = null, last_name = null, birthdate = null, phone = null, phone_e164 = null,
    linkedin_url = null, linkedin_normalized = null,
    employer_name = null, university = null, title = null, city = null,
    nationality = null, invite_code = null, auth_user_id = null,
    gender = null, diet = null, diet_note = null, photo_path = null,
    job_title = null, study_program_label = null, cv_path = null,
    salutation_de = null, salutation_en = null, self_assessment = null,
    deleted_at = now()
  where id = p_person_id;

  delete from person_email where person_id = p_person_id and not is_primary;
  update person_email
     set email = ('deleted+' || p_person_id::text || '@anonym.invalid')::citext, verified = false
   where person_id = p_person_id and is_primary;

  -- 5 · Mail-Protokoll: die Zeile bleibt als Zahl (wie viele Einladungen gingen
  --     raus), die Adresse wird zum Hash und die eingesetzten Angaben — dort
  --     steht der Name im Klartext — verschwinden.
  update mail_log
     set to_email = ('deleted:' || coalesce(v_hash, p_person_id::text))::citext,
         meta = coalesce(meta, '{}'::jsonb) - 'vars'
   where person_id = p_person_id;

  -- 6 · Freitexte und Fremdschlüssel in allen übrigen Tabellen mit `person_id`.
  --     Was bleibt, ist jeweils der zählbare Teil: Status, Typ, Zeitpunkt.
  update application      set answers = '{}'::jsonb where person_id = p_person_id;
  update hack_application set motivation = null, team_pref = null, note = null,
                              github_url = null, website_url = null, behance_url = null
   where person_id = p_person_id;
  -- Der Einwilligungsnachweis bleibt — er ist der Beleg, dass wir durften, was
  -- wir getan haben. Das Gerät, von dem sie kam, ist dafür ohne Bedeutung.
  update consent_record   set user_agent = null where person_id = p_person_id;
  -- Fremdsystem-Verweise zeigen auf Kopien, die dort noch den Namen tragen;
  -- der Verweis selbst darf nicht bleiben (siehe Kopf, vivenu).
  update registration     set external_ref = null, external_ids = '{}'::jsonb where person_id = p_person_id;
  update shift_assignment set decline_reason = null where person_id = p_person_id;
  update volunteer_profile set availability = null, buddy_note = null, notes_internal = null,
                               decision_note = null, coupon_error = null, buddy_person_id = null
   where person_id = p_person_id;
  update ticket set holder_email = null, holder_first_name = null, holder_last_name = null,
                    holder_company = null, holder_position = null, buyer_email = null,
                    team_note = null, extra_fields = '{}'::jsonb
   where person_id = p_person_id;
  -- ADM-076: Begleittickets hängen am Profil des Speakers, nicht an einer Person (`person_id` ist leer). Die Begleitung hat
  --         hier nie ein Konto gehabt und kann die Löschung nicht selbst verlangen — wie der Kontakt ohne Portalzugang (0127)
  --         fällt sie mit dem Profil, das sie eingetragen hat. Name und Adresse gehen; Status, Pass und Lounge bleiben als Zahl.
  --         Was bei vivenu steht (ausgestellte Tickets), räumt die externe Löschung dort auf.
  update ticket set holder_email = null, holder_first_name = null, holder_last_name = null,
                    holder_company = null, holder_position = null, buyer_email = null,
                    team_note = null, extra_fields = '{}'::jsonb
   where source = 'speaker_companion' and speaker_profile_id = any (v_profile);

  -- 7 · Speaker-Profil und was daran hängt.
  update speaker_profile set
    bio_short_de = null, bio_short_en = null, bio_long_de = null, bio_long_en = null,
    job_title = null, organization_name = null, internal_notes = null,
    -- `tech_rider` und `socials` sind `not null default '{}'` — hier gehoert der
    -- leere Wert hin, nicht `null` (Probelauf der Architektur-Session, 23502).
    tech_rider = '{}'::jsonb, socials = '{}'::jsonb,
    decline_reason = null, photo_asset_id = null,
    -- Der Kontakt ohne Portalzugang (0127) gehoert einer **dritten** Person:
    -- Agentur, Office, Management. Sie hat hier nie ein Konto gehabt und kann
    -- die Loeschung auch nicht selbst verlangen — deshalb faellt sie mit dem
    -- Profil, das sie eingetragen hat. Keine Sperrliste: die Adresse stand nie
    -- in einem Verteiler, das Portal kann an sie gar nicht senden (`queue_mail`
    -- braucht eine `person_id`, und eine hat sie nicht).
    contact_first_name = null, contact_last_name = null, contact_email = null,
    contact_phone = null, contact_kind = null, contact_consent_at = null,
    -- LEAD-039: die Einordnung ist eine Einschätzung über die Person, und
    -- `contact_via` nennt, über wen sie läuft.
    category = null, topic_cluster = null, topic_role = null, priority = null,
    recommended_format = null, contact_via = null, outreach_channel = null
   where person_id = p_person_id;
  delete from speaker_stage_candidate where profile_id = any (v_profile);
  -- LEAD-039 Schnitt 2: der Verlauf über die Person geht mit. Einträge, die sie
  -- selbst über andere geschrieben hat, bleiben; sie zeigen dann den
  -- anonymisierten Namen.
  delete from speaker_activity where profile_id = any (v_profile);
  -- Titel und Beschreibung sind der veröffentlichte Programmpunkt und gehören
  -- zur Veranstaltung, nicht zur Person; die interne Notiz nicht.
  update session_submission  set notes = null      where speaker_profile_id = any (v_profile);
  update hospitality_booking set details = '{}'::jsonb, team_note = null where profile_id = any (v_profile);

  -- 8 · Reisekosten. Der Antrag bleibt als Buchung (§147 AO), die Bankdaten
  --     nicht: bezahlt ist bezahlt, und ein offener Antrag ist eine Hürde, die
  --     bis hierher gar nicht kommt.
  delete from vault.secrets
   where id in (select ec.bank_secret_id from expense_claim ec
                 where ec.profile_id = any (v_profile) and ec.bank_secret_id is not null);
  update expense_claim set bank_secret_id = null, bank_masked = null, bank_holder = null,
                           review_note = null
   where profile_id = any (v_profile);

  -- 9 · Der selbst geschriebene Grund ist Freitext von dieser Person und darf
  --     ihre Löschung nicht überleben. Status, Hürden und Zeitpunkt bleiben —
  --     das ist der Nachweis, und der trägt keinen Personenbezug.
  update profile_deletion_request set reason = null where person_id = p_person_id;

  -- 10 · ADM-036: Zusammenführungen, in denen diese Person die bleibende war,
  --      tragen im Protokoll die Daten der zweiten Person (für den Rückweg).
  --      Mit der Löschung gibt es keinen Rückweg mehr; die Zeile bleibt als
  --      Nachweis, dass zusammengeführt wurde.
  update person_merge_log set payload = null where surviving_person_id = p_person_id;

  -- 11 · ADM-077: der Hinweis an einer Side-Event-Einladung (Unverträglichkeit, Begleitung) ist Freitext von dieser Person und
  --      darf ihre Löschung nicht überleben; der Link aus der Einladungsmail wird tot. Stand, Zeitpunkte und Anzahl der Plätze
  --      bleiben — das ist die Zahl, auf der die Planung stand.
  update side_event_invite set note = null, token_hash = null where profile_id = any (v_profile);
end $$;

select harden_definer_functions();
