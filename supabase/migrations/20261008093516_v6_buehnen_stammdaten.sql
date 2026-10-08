-- 0274 · Bühnen-Stammdaten: Art der Bühne, Gültigkeitstage und Sperrzeiten (ADM-085, LEAD-061, LEAD-062)
-- Angewendet von der Architektur-Session am 08.10.2026 als 20261008093516.
-- NNNN · Bühnen-Stammdaten: Art der Bühne, Gültigkeitstage und Sperrzeiten (ADM-085, LEAD-061, LEAD-062; Konrad & Leopold 05.10.2026)
--
-- Anlass: (1) Eine Bühne gilt teilweise nur an einem Tag. (2) Eine **gebrandete Bühne** (Produkt „Bühnen-Branding“: eine unserer Bühnen
-- mit Partner-Organisation) soll von der Standbühne getrennt sein (PART-138). (3) **Sperrzeiten** (z. B. Opening: keine Slots vor 13:00)
-- sollen beim Anlegen und Verschieben von Slots greifen — mit Hinweis statt stiller Ablehnung (LEAD-062). (4) Das Stage-Lead-Board zeigt
-- nur die Hauptbühnen (LEAD-061).
--
-- Datenmodell von Plan am 08.10.2026 bestätigt („dein Vorschlag ist besser als meine Richtung“), eine Migration:
--   1  `stage.valid_days date[] not null default '{}'` — leer heißt **alle Eventtage**. Dazu prüft `upsert_stage`, dass jedes Datum ein
--      `event_day` des Events ist (`invalid_valid_day`). Bewusst **nicht** über `stage_day`-Zeilen: eine Zeile bindet heute den Stage-Lead-
--      Rahmen (`outside_stage_day`), vorhandene Zeilen würden Tage schlagartig sperren.
--   2  `stage.kind` als **generierte Spalte** (STORED, nie geschrieben) aus `type` und `partner_org_id` — eine Quelle, kein Backfill,
--      keine Drift, alle bisherigen Prüfungen auf `type` bleiben unberührt:
--         main | side, ohne Partner      → main            (Hauptbühne)
--         main | side, mit  Partner      → branded         (gebrandete Bühne: eine unserer Bühnen, vom Partner gebrandet)
--         partner_booth                  → booth           (Standbühne)
--         room                           → masterclass     (Raum der Masterclass)
--         interview_table                → interview_table
--         side_event_venue               → side_event
--      Das Stage-Lead-Board zeigt `kind in (main, branded)`; unter /admin/programm gibt es einen Filter (Standard: alle Bühnen).
--      Ein neuer Wert im Vokabular `stage_type` braucht eine Zeile in dieser Abbildung (sonst ist `kind` leer und die Bühne fällt aus
--      den Filtern) — das steht im Spaltenkommentar.
--   3  **Datenkorrektur** (Plan: „gezielt über Edition und Namen“): die vier ChefTreff-Bühnen des Summits (Leadership & Growth,
--      Industry, Startup, Impact & Tech) standen als `side` („Nebenbühne“, der frühere Standardwert von `upsert_stage`) und werden
--      `main`. Funktional ändert das nichts (`kind` ist für beide `main`, keine andere Funktion unterscheidet `main` und `side`) — es
--      beseitigt die Bezeichnung „Nebenbühne“ in den Listen. `upsert_stage` nimmt ohne Angabe jetzt `main`.
--   4  `stage_blocked_time` (Sperrzeiten): `event_id` (= `stage.event_id`; dort hängen Bühnen und Slots), `stage_id` leer = **alle
--      Bühnen des Events**, `starts_at`, `ends_at` (> Beginn), `reason` (1–200 Zeichen, steht in der Fehlermeldung). RLS an, **keine
--      Grants** — gelesen und geschrieben wird nur über drei Funktionen:
--         stage_blocked_times(p_event_id)           Lesen für alle, die ein Board vor sich haben (`is_programme_board_user`) **oder**
--                                                   den Abschnitt `programme` halten (wer pflegen darf, muss lesen können)
--         upsert_stage_blocked_time(p_data)         Anlegen/Ändern hinter `has_admin_section('programme')`, mit Audit; meldet, wie viele
--                                                   **vorhandene** Inhalts-Slots schon in der Sperrzeit liegen (sie bleiben, werden beim
--                                                   nächsten Verschieben geprüft)
--         delete_stage_blocked_time(p_id)           Löschen, gleiches Recht, mit Audit
--   5  **Prüfung beim Anlegen und Verschieben** — der interne Helfer `stage_slot_check(stage, start, ende, slot_type)` wird von den
--      **drei** Funktionen gerufen, die Slot-Zeiten schreiben (alle anderen berühren nur Status oder Zuordnung):
--         create_slot             (Board, Tabelle, Stage Leads, Standbühnen-Editoren)
--         move_slot               (Board, Tabelle, Partner an der eigenen Standbühne)
--         partner_create_session  (Side Events und Interview Tables der Partner; Slot-Art `partner_block`)
--      **Gültigkeitstage** gelten für jede Slot-Art (`stage_not_valid_that_day`, detail = das Datum); **Sperrzeiten** nur für
--      `slot_type = 'content'` — Rahmen und feste Blöcke (`frame`, `fixed_block`, z. B. das Opening selbst) darf das Team in einer
--      Sperrzeit anlegen, und Side Events/Interview Tables der Partner (`partner_block`) sind keine Programmpunkte der Bühnen. Die
--      Überschneidung ist **halboffen** (ein Slot, der genau am Beginn der Sperrzeit endet, ist erlaubt) und gilt für Bühnen mit
--      passender `stage_id` und für Sperrzeiten ohne Bühne. **Hart für alle**, auch für das Team: `slot_blocked`, detail
--      „Grund · HH:MM–HH:MM“ (Ereigniszeit; über Tagesgrenzen „Grund · TT.MM. HH:MM – TT.MM. HH:MM“). Aufheben heißt: die Sperrzeit
--      ändern oder löschen (Recht `programme`) — es gibt keinen stillen Ausweg.
--      `move_slot` prüft **vor** der Rückfrage zur Veröffentlichung (`confirmation_required`), damit niemand erst bestätigt und dann
--      abgewiesen wird.
--
-- Rechte der Lesespalten: `stage` hat eine Spalten-Whitelist für `authenticated` (Migration v2_edition_programme); `kind` und
-- `valid_days` kommen dazu — beides sind Bühnenstammdaten ohne Personenbezug, wie `type` und `capacity`.
--
-- Fehlerschlüssel (Wörterbuch und `lib/rpc-error.ts`): slot_blocked, stage_not_valid_that_day, invalid_valid_day, invalid_blocked_time,
-- blocked_time_not_found. Bestehende Funktionen sind aus dem Snapshot abgeleitet (`fn-diff`): create_slot, move_slot,
-- partner_create_session, upsert_stage, programme_skeleton — je nur die genannten Zusätze.
--
-- Hängt von keiner offenen Migration ab (nur Tabellen und Funktionen, die live sind).
set search_path = public, extensions;

-- ======================================================================================================
-- 1 · Gültigkeitstage und Art der Bühne
-- ======================================================================================================
alter table stage add column if not exists valid_days date[] not null default '{}';
comment on column stage.valid_days is
  'Gültigkeitstage der Bühne (ADM-085): leer = alle Eventtage; sonst trägt die Bühne nur an diesen Tagen Slots (create_slot, move_slot und partner_create_session lehnen andere Tage mit stage_not_valid_that_day ab). Geschrieben nur über upsert_stage, das jedes Datum gegen event_day prüft.';

alter table stage add column if not exists kind text generated always as (
  case
    when type in ('main', 'side') and partner_org_id is null then 'main'
    when type in ('main', 'side') then 'branded'
    when type = 'partner_booth' then 'booth'
    when type = 'room' then 'masterclass'
    when type = 'interview_table' then 'interview_table'
    when type = 'side_event_venue' then 'side_event'
  end) stored;
comment on column stage.kind is
  'Art der Bühne (ADM-085, LEAD-061), abgeleitet aus type und partner_org_id, nie geschrieben: main = Hauptbühne (main/side ohne Partner), branded = gebrandete Bühne (main/side mit Partner), booth = Standbühne (partner_booth), masterclass = Raum (room), interview_table, side_event = Side-Event-Ort (side_event_venue). Ein neuer Wert im Vokabular stage_type braucht eine Zeile in dieser Abbildung, sonst bleibt kind leer und die Bühne fällt aus den Filtern.';

-- `stage` hat eine Spalten-Whitelist für authenticated (v2_edition_programme): beide Spalten sind Stammdaten ohne Personenbezug.
grant select (kind, valid_days) on stage to authenticated;

-- ======================================================================================================
-- 2 · Datenkorrektur: die vier ChefTreff-Bühnen des Summits sind Hauptbühnen
-- ======================================================================================================
-- Sie standen als `side` („Nebenbühne“, der frühere Standardwert von upsert_stage). Gezielt über Event und Namen, damit keine
-- Test- oder Partnerbühne mitgenommen wird; ein zweiter Lauf ändert nichts mehr. Für `kind` ändert es nichts (main und side ohne Partner
-- sind beide `main`), es beseitigt nur die Bezeichnung „Nebenbühne“ in den Listen.
update stage st set type = 'main'
 where st.type = 'side'
   and st.partner_org_id is null
   and st.name in ('Leadership & Growth Stage', 'Industry Stage', 'Startup Stage', 'Impact & Tech Stage')
   and st.event_id in (select e.id from event e where not e.is_edition and e.format_tag = 'summit');

-- ======================================================================================================
-- 3 · Sperrzeiten
-- ======================================================================================================
create table if not exists stage_blocked_time (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references event(id) on delete cascade,
  stage_id   uuid references stage(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text not null,
  created_by uuid references person(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stage_blocked_time_range_chk check (ends_at > starts_at),
  constraint stage_blocked_time_reason_chk check (length(btrim(reason)) between 1 and 200)
);
comment on table stage_blocked_time is
  'Sperrzeiten (ADM-085, LEAD-062): in diesem Zeitraum trägt die Bühne keine Inhalts-Slots; stage_id leer = alle Bühnen des Events. Keine Grants, RLS an — gelesen und geschrieben nur über stage_blocked_times, upsert_stage_blocked_time und delete_stage_blocked_time; geprüft in create_slot und move_slot (stage_slot_check).';
comment on column stage_blocked_time.reason is
  'Grund, 1–200 Zeichen. Steht im Klartext in der Fehlermeldung slot_blocked an alle, die einen Slot setzen wollen — kein Personenbezug hineinschreiben.';
create index if not exists stage_blocked_time_event_idx on stage_blocked_time (event_id, starts_at);

alter table stage_blocked_time enable row level security;
revoke all on stage_blocked_time from anon, authenticated;
grant all on stage_blocked_time to service_role;

drop trigger if exists trg_stage_blocked_time_updated on stage_blocked_time;
create trigger trg_stage_blocked_time_updated before update on stage_blocked_time
  for each row execute function set_updated_at();

-- Die Bühne gehört zum selben Event wie die Sperrzeit (ein Fremdschlüssel allein sagt das nicht).
create or replace function stage_blocked_time_check() returns trigger
 language plpgsql
 set search_path to 'public', 'extensions'
as $$
begin
  if new.stage_id is not null
     and not exists (select 1 from stage st where st.id = new.stage_id and st.event_id = new.event_id) then
    raise exception 'stage_not_found' using errcode = 'P0002', detail = 'stage_event_mismatch';
  end if;
  return new;
end $$;
drop trigger if exists trg_stage_blocked_time_check on stage_blocked_time;
create trigger trg_stage_blocked_time_check before insert or update of event_id, stage_id on stage_blocked_time
  for each row execute function stage_blocked_time_check();

-- ======================================================================================================
-- 4 · Prüfung beim Anlegen und Verschieben (intern)
-- ======================================================================================================
-- Gültigkeitstage für jede Slot-Art; Sperrzeiten nur für Inhalts-Slots. Halboffene Überschneidung. Wirft; kein Rückgabewert.
create or replace function stage_slot_check(p_stage_id uuid, p_start timestamptz, p_end timestamptz, p_slot_type text)
 returns void
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'extensions'
as $$
declare v_stage stage%rowtype; v_tz text; v_date date; v_b record;
begin
  select * into v_stage from stage where id = p_stage_id;
  if not found then return; end if;   -- „Bühne nicht gefunden“ meldet die aufrufende Funktion selbst
  select coalesce(e.timezone, 'Europe/Berlin') into v_tz from event e where e.id = v_stage.event_id;
  v_date := (p_start at time zone v_tz)::date;

  if cardinality(v_stage.valid_days) > 0 and not (v_date = any (v_stage.valid_days)) then
    raise exception 'stage_not_valid_that_day' using errcode = 'P0001', detail = to_char(v_date, 'DD.MM.YYYY');
  end if;

  if p_slot_type = 'content' then
    select b.reason, b.starts_at, b.ends_at into v_b
      from stage_blocked_time b
     where b.event_id = v_stage.event_id
       and (b.stage_id is null or b.stage_id = p_stage_id)
       and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_start, p_end, '[)')
     order by b.starts_at, b.id
     limit 1;
    if found then
      raise exception 'slot_blocked' using errcode = 'P0001',
        detail = v_b.reason || ' · ' || case
          when (v_b.starts_at at time zone v_tz)::date = (v_b.ends_at at time zone v_tz)::date
            then to_char(v_b.starts_at at time zone v_tz, 'HH24:MI') || '–' || to_char(v_b.ends_at at time zone v_tz, 'HH24:MI')
          else to_char(v_b.starts_at at time zone v_tz, 'DD.MM. HH24:MI') || ' – ' || to_char(v_b.ends_at at time zone v_tz, 'DD.MM. HH24:MI')
        end;
    end if;
  end if;
end $$;
comment on function stage_slot_check(uuid, timestamptz, timestamptz, text) is
  'Intern (ADM-085): wirft stage_not_valid_that_day (Tag nicht in valid_days) und für Inhalts-Slots slot_blocked (Sperrzeit der Bühne oder des Events, halboffen); gerufen von create_slot, move_slot und partner_create_session.';

-- ======================================================================================================
-- 5 · Sperrzeiten lesen, anlegen, ändern, löschen
-- ======================================================================================================
create or replace function stage_blocked_times(p_event_id uuid default null)
 returns table (id uuid, event_id uuid, stage_id uuid, stage_name text, starts_at timestamptz, ends_at timestamptz,
                reason text, slots_affected integer)
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'extensions'
as $$
declare v_ev uuid;
begin
  -- Wer ein Board vor sich hat (Admin, Programm-Team, Stage Leads, Standbühnen) **oder** den Abschnitt `programme` hält — wer
  -- Sperrzeiten pflegen darf, muss sie auch lesen können (die Leitungen Speaker und Produktion halten den Abschnitt, sind aber
  -- keine Board-Nutzer im Sinne von `is_programme_board_user`).
  if not (is_programme_board_user() or has_admin_section('programme')) then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Ohne Angabe der Summit, den auch das Board wählt: Veranstaltungen mit Bühnen, Summit zuerst.
  v_ev := coalesce(p_event_id, (select e.id from event e
                                 where not e.is_edition and exists (select 1 from stage st where st.event_id = e.id)
                                 order by (e.format_tag is distinct from 'summit'), e.start_date
                                 limit 1));
  if v_ev is null then return; end if;
  return query
    select b.id, b.event_id, b.stage_id, st.name, b.starts_at, b.ends_at, b.reason,
           (select count(*)::integer
              from slot s join stage s2 on s2.id = s.stage_id
             where s2.event_id = b.event_id
               and (b.stage_id is null or s.stage_id = b.stage_id)
               and s.slot_type = 'content'
               and tstzrange(s.start_at, s.end_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)'))
      from stage_blocked_time b
      left join stage st on st.id = b.stage_id
     where b.event_id = v_ev
     order by b.starts_at, st.name nulls first, b.id;
end $$;
comment on function stage_blocked_times(uuid) is
  'Sperrzeiten des Events (ohne Angabe: des Summits) mit Name der Bühne (leer = alle) und der Zahl vorhandener Inhalts-Slots darin; für alle, die ein Board vor sich haben (is_programme_board_user) oder den Abschnitt programme halten.';

create or replace function upsert_stage_blocked_time(p_data jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
declare
  v_id uuid := nullif(p_data->>'id', '')::uuid;
  v_cur stage_blocked_time%rowtype;
  v_event uuid; v_stage uuid; v_from timestamptz; v_to timestamptz; v_reason text; v_before jsonb; v_n integer;
begin
  if not has_admin_section('programme') then raise exception 'not allowed' using errcode = '42501'; end if;

  if v_id is not null then
    select * into v_cur from stage_blocked_time where id = v_id for update;
    if not found then raise exception 'blocked_time_not_found' using errcode = 'P0002'; end if;
    v_event := v_cur.event_id;
    v_before := to_jsonb(v_cur);
  else
    begin
      v_event := nullif(p_data->>'event_id', '')::uuid;
    exception when others then
      raise exception 'event_not_found' using errcode = 'P0002';
    end;
    if not exists (select 1 from event e where e.id = v_event and not e.is_edition) then
      raise exception 'event_not_found' using errcode = 'P0002';
    end if;
  end if;

  begin
    v_stage  := case when p_data ? 'stage_id' then nullif(p_data->>'stage_id', '')::uuid else v_cur.stage_id end;
    v_from   := case when p_data ? 'starts_at' then (p_data->>'starts_at')::timestamptz else v_cur.starts_at end;
    v_to     := case when p_data ? 'ends_at' then (p_data->>'ends_at')::timestamptz else v_cur.ends_at end;
  exception when others then
    raise exception 'invalid_blocked_time' using errcode = '22023', detail = 'format';
  end;
  v_reason := case when p_data ? 'reason' then nullif(btrim(p_data->>'reason'), '') else v_cur.reason end;

  if v_from is null or v_to is null or v_to <= v_from then
    raise exception 'invalid_blocked_time' using errcode = '22023', detail = 'range';
  end if;
  if v_reason is null then raise exception 'invalid_blocked_time' using errcode = '22023', detail = 'reason_required'; end if;
  if length(v_reason) > 200 then raise exception 'invalid_blocked_time' using errcode = '22023', detail = 'reason_too_long'; end if;
  if v_stage is not null and not exists (select 1 from stage st where st.id = v_stage and st.event_id = v_event) then
    raise exception 'stage_not_found' using errcode = 'P0002';
  end if;

  if v_id is null then
    insert into stage_blocked_time (event_id, stage_id, starts_at, ends_at, reason, created_by)
    values (v_event, v_stage, v_from, v_to, v_reason, current_person_id())
    returning id into v_id;
  else
    update stage_blocked_time set stage_id = v_stage, starts_at = v_from, ends_at = v_to, reason = v_reason where id = v_id;
  end if;

  -- Vorhandene Inhalts-Slots in der Sperrzeit bleiben; sie werden beim nächsten Verschieben geprüft. Die Zahl sagt dem Team, was es sieht.
  select count(*)::integer into v_n
    from slot s join stage st on st.id = s.stage_id
   where st.event_id = v_event
     and (v_stage is null or s.stage_id = v_stage)
     and s.slot_type = 'content'
     and tstzrange(s.start_at, s.end_at, '[)') && tstzrange(v_from, v_to, '[)');

  perform log_audit('programme.blocked_time_upsert', 'stage_blocked_time', v_id::text, v_before,
                    jsonb_build_object('event_id', v_event, 'stage_id', v_stage, 'starts_at', v_from, 'ends_at', v_to,
                                       'reason', v_reason, 'slots_affected', v_n));
  return jsonb_build_object('id', v_id, 'affected', v_n);
end $$;
comment on function upsert_stage_blocked_time(jsonb) is
  'Sperrzeit anlegen (event_id, stage_id optional, starts_at, ends_at, reason) oder ändern (id plus die geänderten Felder); nur has_admin_section(programme). Antwort: {id, affected} — wie viele vorhandene Inhalts-Slots schon in der Sperrzeit liegen.';

create or replace function delete_stage_blocked_time(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
declare v_row stage_blocked_time%rowtype;
begin
  if not has_admin_section('programme') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_row from stage_blocked_time where id = p_id for update;
  if not found then raise exception 'blocked_time_not_found' using errcode = 'P0002'; end if;
  delete from stage_blocked_time where id = p_id;
  perform log_audit('programme.blocked_time_delete', 'stage_blocked_time', p_id::text, to_jsonb(v_row), null);
end $$;
comment on function delete_stage_blocked_time(uuid) is 'Sperrzeit löschen; nur has_admin_section(programme), mit Audit.';

-- ======================================================================================================
-- 6 · Geänderte Funktionen (Basis: supabase/snapshot/functions, Live-Fassung nach 0273). `fn-diff` zeigt je Funktion genau die
--     Zusätze: create_slot, move_slot und partner_create_session rufen `stage_slot_check`; upsert_stage kennt `valid_days` und
--     nimmt `main` als Standardart; programme_skeleton (die Gerüst-Seite unter /admin/edition) liefert je Bühne `kind` und `valid_days`.
-- ======================================================================================================

create or replace function create_slot(p_stage_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_slot_type text DEFAULT 'content'::text, p_session_id uuid DEFAULT NULL::uuid, p_source_ref text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_stage stage%rowtype;
  v_tz    text;
  v_day   event_day%rowtype;
  v_sd    stage_day%rowtype;
  v_id    uuid;
  v_win   record;
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

  -- ADM-085: Gültigkeitstage der Bühne und Sperrzeiten (nur Inhalts-Slots) — hart für alle, der Grund steht im detail.
  perform stage_slot_check(p_stage_id, p_start, p_end, p_slot_type);

  -- Tagesrahmen (LEAD-016): für Stage Leads hart, für das Programm-Team eine
  -- Warnung wie bisher. Ohne Rahmen keine Grenze (siehe Kopf).
  select * into v_sd from stage_day where stage_id = p_stage_id and event_day_id = v_day.id;
  if found and stage_frame_binds(p_stage_id) and (
       (v_sd.open_from is not null and (p_start at time zone v_tz)::time < v_sd.open_from)
    or (v_sd.open_to   is not null and (p_end   at time zone v_tz)::time > v_sd.open_to)) then
    raise exception 'outside_stage_day' using errcode = 'P0001',
      detail = coalesce(to_char(v_sd.open_from, 'HH24:MI'), '') || '–' || coalesce(to_char(v_sd.open_to, 'HH24:MI'), '');
  end if;
  -- PART-079: Standbühne eines Partners — frühestens 90 Minuten nach Öffnung des Tages, der letzte
  -- Slot endet spätestens 19:00. Für den Partner hart; das Programm-Team darf abweichen.
  if partner_window_binds(p_stage_id) then
    select * into v_win from partner_booth_window(p_stage_id, v_day.id);
    if (v_win.von is not null and (p_start at time zone v_tz)::time < v_win.von)
       or (p_end at time zone v_tz)::time > v_win.bis then
      raise exception 'outside_partner_window' using errcode = 'P0001',
        detail = coalesce(to_char(v_win.von, 'HH24:MI'), '') || '–' || to_char(v_win.bis, 'HH24:MI');
    end if;
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

create or replace function move_slot(p_slot_id uuid, p_stage_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
  v_win       record;
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
  -- ADM-085: Gültigkeitstage der Zielbühne und Sperrzeiten — **vor** der Rückfrage zur Veröffentlichung, damit niemand erst
  -- bestätigt und dann abgewiesen wird. Sperrzeiten gelten für Inhalts-Slots; Rahmen und feste Blöcke bleiben frei.
  perform stage_slot_check(p_stage_id, p_start, p_end, v_slot.slot_type);
  select exists (select 1 from session se where se.slot_id = p_slot_id and se.publish_status = 'published')
    into v_published;
  if v_published and not p_confirm then
    raise exception 'confirmation_required'
      using errcode = 'P0001', hint = 'Slot ist veröffentlicht. Verschieben nur mit Bestätigung.';
  end if;
  select * into v_sd from stage_day where stage_id = p_stage_id and event_day_id = v_day.id;
  -- Tagesrahmen (LEAD-016): für Stage Leads hart, für das Programm-Team eine
  -- Warnung wie bisher. Ohne Rahmen keine Grenze (siehe Kopf).
  if found and stage_frame_binds(p_stage_id) and (
       (v_sd.open_from is not null and (p_start at time zone v_tz)::time < v_sd.open_from)
    or (v_sd.open_to   is not null and (p_end   at time zone v_tz)::time > v_sd.open_to)) then
    raise exception 'outside_stage_day' using errcode = 'P0001',
      detail = coalesce(to_char(v_sd.open_from, 'HH24:MI'), '') || '–' || coalesce(to_char(v_sd.open_to, 'HH24:MI'), '');
  end if;
  if found then
    if v_sd.open_from is not null and (p_start at time zone v_tz)::time < v_sd.open_from then
      v_warn := array_append(v_warn, 'before_open');
    end if;
    if v_sd.open_to is not null and (p_end at time zone v_tz)::time > v_sd.open_to then
      v_warn := array_append(v_warn, 'after_close');
    end if;
  end if;
  -- PART-079: Standbühne eines Partners — frühestens 90 Minuten nach Öffnung des Tages, der letzte
  -- Slot endet spätestens 19:00. Für den Partner hart; das Programm-Team darf abweichen.
  if partner_window_binds(p_stage_id) then
    select * into v_win from partner_booth_window(p_stage_id, v_day.id);
    if (v_win.von is not null and (p_start at time zone v_tz)::time < v_win.von)
       or (p_end at time zone v_tz)::time > v_win.bis then
      raise exception 'outside_partner_window' using errcode = 'P0001',
        detail = coalesce(to_char(v_win.von, 'HH24:MI'), '') || '–' || to_char(v_win.bis, 'HH24:MI');
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

create or replace function partner_create_session(p_org_id uuid, p_format text, p_stage_id uuid, p_day_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_title_de text, p_capacity integer DEFAULT 1, p_details jsonb DEFAULT '{}'::jsonb, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; v_me uuid := current_person_id(); v_slot uuid; v_id uuid;
        v_stage stage; v_day event_day; v_details jsonb; v_free integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_format not in ('side_event', 'interview_table') then
    raise exception 'invalid_format' using errcode = '22023', detail = coalesce(p_format, 'null');
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  if nullif(btrim(coalesce(p_title_de, '')), '') is null then
    raise exception 'title_required' using errcode = '22023';
  end if;
  if p_end is null or p_start is null or p_end <= p_start then
    raise exception 'invalid_time' using errcode = '22023', detail = 'end_after_start';
  end if;

  -- Die Fläche gehört dieser Organisation und ist vom richtigen Typ.
  select * into v_stage from stage where id = p_stage_id and active;
  if not found then raise exception 'stage_not_found' using errcode = 'P0002'; end if;
  if v_stage.partner_org_id is distinct from p_org_id then
    raise exception 'not allowed' using errcode = '42501', detail = 'stage_not_yours';
  end if;
  if v_stage.type <> (case p_format when 'interview_table' then 'interview_table' else 'side_event_venue' end) then
    raise exception 'invalid_format' using errcode = '22023', detail = 'stage_type';
  end if;
  select * into v_day from event_day where id = p_day_id and event_id = v_stage.event_id;
  if not found then raise exception 'day_not_found' using errcode = 'P0002'; end if;
  -- ADM-085: Gültigkeitstage der Fläche (Sperrzeiten gelten für Inhalts-Slots, nicht für `partner_block`).
  perform stage_slot_check(p_stage_id, p_start, p_end, 'partner_block');

  -- Anspruch: beim Side-Event zählt jedes Stück, beim Interview Table der Tisch — die Fläche
  -- existiert dann bereits, und wie viele Gespräche daraufpassen, entscheidet der Kalender.
  if p_format = 'side_event' then
    v_free := partner_entitlement(v_oe.id, 'side_event');
    if v_free <= 0 then raise exception 'no_entitlement' using errcode = 'P0001', detail = p_format; end if;
  end if;

  -- Auflage 6: auch beim Anlegen die Organisation mitgeben, sonst könnte ein Partner beim
  -- ersten Speichern ein fremdes Bild setzen und es danach nie wieder anfassen.
  v_details := check_format_details(p_format, p_details, p_org_id);

  -- Zeiten am Slot (Weg A, Konrad 18.09.): der Ausschluss-Constraint `slot_no_overlap`
  -- verhindert zwei Gespräche zur selben Zeit an derselben Fläche — ohne eigene Prüfung.
  begin
    -- Status aus dem Vokabular `slot_status`: solange das Team freigeben muss, ist der Slot
    -- **angefragt**, nicht final — sonst stünde im Board eine Zusage, die niemand gegeben hat.
    insert into slot (stage_id, event_day_id, start_at, end_at, slot_type, status, source_ref, created_by)
    values (p_stage_id, p_day_id, p_start, p_end, 'partner_block',
            case when session_needs_release(v_oe.edition_id) then 'requested' else 'final' end,
            'partner:' || p_org_id::text, v_me)
    returning id into v_slot;
  exception when exclusion_violation then
    raise exception 'slot_overlap' using errcode = 'P0001', detail = p_start::text;
  end;

  insert into session (event_id, slot_id, format, title_de, language, access_mode, capacity,
                       partner_org_id, host_org_id, format_details, publish_status, created_by, updated_by)
  values (v_stage.event_id, v_slot, p_format, btrim(p_title_de), 'de', 'application',
          -- Einzelgespräch heißt eine Person je Slot; beim Gruppengespräch entscheidet der
          -- Partner (Konrad, D1). Ohne Angabe gilt Einzelgespräch.
          case when p_format = 'interview_table'
               then case when coalesce(v_details->>'interview_mode', 'single') = 'single'
                         then 1 else coalesce(p_capacity, 1) end
               else p_capacity end,
          p_org_id, p_org_id, v_details,
          case when session_needs_release(v_oe.edition_id) then 'review' else 'draft' end,
          v_me, v_me)
  returning id into v_id;

  perform log_audit('partner.session_create', 'session', v_id::text, null,
                    jsonb_build_object('org_id', p_org_id, 'format', p_format, 'slot_id', v_slot));
  return v_id;
end $$;

create or replace function upsert_stage(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid := nullif(p_data->>'id', '')::uuid; v_event uuid; v_type text; v_before jsonb;
        v_valid date[]; v_d text; v_day date;
begin
  if v_id is not null then
    select st.event_id into v_event from stage st where st.id = v_id;
    if v_event is null then raise exception 'stage_not_found' using errcode = 'P0002'; end if;
  else
    v_event := nullif(p_data->>'event_id', '')::uuid;
    if not exists (select 1 from event e where e.id = v_event) then
      raise exception 'event_not_found' using errcode = 'P0002';
    end if;
  end if;
  if not is_programme_editor(v_event) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_type := nullif(p_data->>'type', '');
  -- Vorher: v_type not in ('main', 'side', 'partner_booth', 'room')
  if v_type is not null and not is_vocab_key('stage_type', v_type) then
    raise exception 'invalid_stage_type' using errcode = '22023', detail = v_type;
  end if;

  -- ADM-085: Gültigkeitstage — leer heißt alle Eventtage; jedes Datum muss ein Tag dieses Events sein.
  if p_data ? 'valid_days' then
    if jsonb_typeof(p_data -> 'valid_days') is distinct from 'array' then
      raise exception 'invalid_valid_day' using errcode = '22023', detail = 'not_an_array';
    end if;
    v_valid := '{}';
    for v_d in select jsonb_array_elements_text(p_data -> 'valid_days') loop
      begin
        v_day := v_d::date;
      exception when others then
        raise exception 'invalid_valid_day' using errcode = '22023', detail = left(v_d, 40);
      end;
      if not exists (select 1 from event_day ed where ed.event_id = v_event and ed.day_date = v_day) then
        raise exception 'invalid_valid_day' using errcode = '22023', detail = v_d;
      end if;
      v_valid := array_append(v_valid, v_day);
    end loop;
    select coalesce(array_agg(distinct x order by x), '{}') into v_valid from unnest(v_valid) x;
  end if;

  select to_jsonb(st) into v_before from stage st where st.id = v_id;

  if v_id is null then
    insert into stage (event_id, name, slug, type, room, capacity, partner_org_id, stage_lead_person_id,
                       changeover_min, default_duration_min, partner_slot_quota, sort_order, active, valid_days)
    values (v_event, btrim(p_data->>'name'), nullif(btrim(p_data->>'slug'), ''), coalesce(v_type, 'main'),
            nullif(btrim(p_data->>'room'), ''), (p_data->>'capacity')::integer,
            nullif(p_data->>'partner_org_id', '')::uuid, nullif(p_data->>'stage_lead_person_id', '')::uuid,
            coalesce((p_data->>'changeover_min')::integer, 0),
            coalesce((p_data->>'default_duration_min')::integer, 30),
            (p_data->>'partner_slot_quota')::integer,
            coalesce((p_data->>'sort_order')::integer, 0),
            coalesce((p_data->>'active')::boolean, true), coalesce(v_valid, '{}'))
    returning id into v_id;
  else
    update stage set
      name                 = coalesce(nullif(btrim(p_data->>'name'), ''), name),
      slug                 = case when p_data ? 'slug' then nullif(btrim(p_data->>'slug'), '') else slug end,
      type                 = coalesce(v_type, type),
      room                 = case when p_data ? 'room' then nullif(btrim(p_data->>'room'), '') else room end,
      capacity             = case when p_data ? 'capacity' then (p_data->>'capacity')::integer else capacity end,
      partner_org_id       = case when p_data ? 'partner_org_id' then nullif(p_data->>'partner_org_id', '')::uuid else partner_org_id end,
      stage_lead_person_id = case when p_data ? 'stage_lead_person_id' then nullif(p_data->>'stage_lead_person_id', '')::uuid else stage_lead_person_id end,
      changeover_min       = coalesce((p_data->>'changeover_min')::integer, changeover_min),
      default_duration_min = coalesce((p_data->>'default_duration_min')::integer, default_duration_min),
      partner_slot_quota   = case when p_data ? 'partner_slot_quota' then (p_data->>'partner_slot_quota')::integer else partner_slot_quota end,
      sort_order           = coalesce((p_data->>'sort_order')::integer, sort_order),
      active               = coalesce((p_data->>'active')::boolean, active),
      valid_days           = case when p_data ? 'valid_days' then v_valid else valid_days end
    where id = v_id;
  end if;

  perform log_audit('programme.stage_upsert', 'stage', v_id::text, v_before, p_data);
  return v_id;
end $$;

create or replace function programme_skeleton(p_event_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ev uuid;
begin
  select coalesce(p_event_id, (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ev;
  if v_ev is null then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if not is_programme_editor(v_ev) then raise exception 'not allowed' using errcode = '42501'; end if;

  return jsonb_build_object(
    'event', (select jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug,
                                        'start_date', e.start_date, 'end_date', e.end_date,
                                        'timezone', e.timezone, 'venue', e.venue)
                from event e where e.id = v_ev),
    'days', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', ed.id, 'day_date', ed.day_date, 'label_de', ed.label_de, 'label_en', ed.label_en,
                        'doors_open', ed.doors_open, 'programme_start', ed.programme_start,
                        'programme_end', ed.programme_end, 'sort_order', ed.sort_order,
                        'slots', (select count(*) from slot s where s.event_day_id = ed.id))
                      order by ed.day_date, ed.sort_order)
                from event_day ed where ed.event_id = v_ev), '[]'::jsonb),
    'stages', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', st.id, 'name', st.name, 'slug', st.slug, 'type', st.type, 'room', st.room,
                        'capacity', st.capacity, 'changeover_min', st.changeover_min,
                        'default_duration_min', st.default_duration_min,
                        'partner_slot_quota', st.partner_slot_quota, 'partner_org_id', st.partner_org_id,
                        'partner_org_name', (select coalesce(o.communication_name, o.legal_name)
                                               from organization o where o.id = st.partner_org_id),
                        'stage_lead_person_id', st.stage_lead_person_id,
                        'stage_lead_name', (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                                              from person p where p.id = st.stage_lead_person_id),
                        'sort_order', st.sort_order, 'active', st.active,
                        'kind', st.kind, 'valid_days', st.valid_days,
                        'slots', (select count(*) from slot s where s.stage_id = st.id))
                      order by st.sort_order, st.name)
                from stage st where st.event_id = v_ev), '[]'::jsonb),
    'stage_days', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', sd.id, 'stage_id', sd.stage_id, 'event_day_id', sd.event_day_id,
                        'open_from', sd.open_from, 'open_to', sd.open_to,
                        'slot_quota', sd.slot_quota, 'notes', sd.notes))
                from stage_day sd
                join stage st on st.id = sd.stage_id
                where st.event_id = v_ev), '[]'::jsonb),
    'tracks', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', t.id, 'name_de', t.name_de, 'name_en', t.name_en, 'slug', t.slug,
                        'sort_order', t.sort_order,
                        'sessions', (select count(*) from session se where se.track_id = t.id))
                      order by t.sort_order, t.name_de)
                from track t where t.event_id = v_ev), '[]'::jsonb)
  );
end $$;

-- ======================================================================================================
-- 7 · Rechte
-- ======================================================================================================
-- Der Helfer wird nur von den Funktionen oben gerufen (SECURITY DEFINER, läuft als Eigentümer): kein EXECUTE für Aufrufer.
revoke execute on function stage_slot_check(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function stage_blocked_times(uuid) from public, anon;
grant execute on function stage_blocked_times(uuid) to authenticated;
revoke execute on function upsert_stage_blocked_time(jsonb) from public, anon;
grant execute on function upsert_stage_blocked_time(jsonb) to authenticated;
revoke execute on function delete_stage_blocked_time(uuid) from public, anon;
grant execute on function delete_stage_blocked_time(uuid) to authenticated;

select harden_definer_functions();
