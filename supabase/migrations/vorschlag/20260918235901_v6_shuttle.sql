-- 00NN · Welle 6 · Shuttle-Fahrten als eigenes Objekt (A7.1, SPK-016, LEAD-011, ADM-028)
--
-- Vorschlag der Build-Session Speaker-Domäne. Anwenden, Umbenennen und der
-- Eintrag ins Entscheidungslog gehören der Architektur-/Security-Session.
--
-- Anlass: Konrad am 17.09. — „Shuttle lässt sich nicht buchen." Heute gibt es
-- Shuttles nur als Kontingent in `hospitality_booking` mit einem Freitextfeld
-- `details`. Eine Fahrt hat aber Abholzeit, Abholort, Zieladresse, eine
-- Telefonnummer für den Fahrer und eine späteste Ankunft; aus einem JSON-Feld
-- lässt sich keine Liste für das Shuttle-Unternehmen bauen. Die Felder hier
-- sind die der Airtable-Shuttle-Tabelle 2026.
--
-- **Drei Antragsteller, eine Freigabe** (Konrad, 17.09.): „Der Speaker über das
-- Portal und durch uns im Speaker-Admin Bereich. Hier muss es ausnahmsweise
-- auch einen Bereich im Speaker-Leads Portal geben … Jede Fahrt aus dem Leads
-- und Speaker Portal muss einmal vom Speaker-Admin freigegeben werden."
-- Deshalb entsteht **jede** Fahrt als `requested`, auch die des Teams: eine
-- Ausnahme für das eigene Haus wäre genau die Lücke, durch die ungeprüfte
-- Fahrten laufen.
--
-- **Obergrenze fünf je Speaker** (Konrad, D8): keine harte Wand, sondern eine
-- Schwelle. Ab der sechsten Fahrt verlangt die Funktion eine Begründung —
-- „Weitere Fahrt beantragen". Gezählt werden nicht stornierte Fahrten.
--
-- **Additiv.** `hospitality_booking` bleibt unverändert, auch das Kind
-- `shuttle`; `hospitality_options`, `hospitality_admin_overview` und
-- `hospitality_block_reason` werden nicht angefasst. Nur die Oberfläche bietet
-- Shuttles künftig über dieses Formular an. Bestandsübernahme und das Entfernen
-- des Kinds sind eine eigene spätere Migration (Festlegung der
-- Architektur-Session, 17.09.).
--
-- Fahrten laufen **nicht** gegen ein Kontingent aus `hospitality_quota` — das
-- Shuttle-Unternehmen rechnet je Fahrt ab.
--
-- Fehlerschlüssel: 28000 · 42501 · P0002 `shuttle_not_found`,
-- `speaker_not_found` · 22023 `invalid_shuttle` (+ detail), `fields_required`
-- · P0001 `shuttle_limit` (detail = Zahl der vorhandenen Fahrten),
-- `shuttle_not_open` (detail = Status).

set search_path = public, extensions;

-- === Vokabular ===============================================================

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order) values
  ('shuttle_status', 'requested', 'Angefragt',  'Requested', 1),
  ('shuttle_status', 'confirmed', 'Bestätigt',  'Confirmed', 2),
  ('shuttle_status', 'cancelled', 'Storniert',  'Cancelled', 3)
on conflict (vocabulary, key) do nothing;

-- === Tabelle =================================================================

create table if not exists shuttle_booking (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references speaker_profile(id) on delete cascade,
  -- Der Name steht **an der Fahrt**, nicht an der Person: gefahren wird oft
  -- jemand anderes (Begleitung, Agentur), und der Export ans Shuttle-Unternehmen
  -- soll nie an der Personentabelle hängen.
  passenger_name     text not null,
  passengers         integer not null default 1,
  driver_phone       text,
  pickup_at          timestamptz not null,
  pickup_location    text not null,
  pickup_address     text,
  dropoff_location   text not null,
  dropoff_address    text,
  latest_arrival_at  timestamptz,
  status             text not null default 'requested',
  booked_by_email    text,
  note               text,
  -- Begründung für die sechste und jede weitere Fahrt.
  over_limit_reason  text,
  created_by         uuid references person(id),
  confirmed_by       uuid references person(id),
  confirmed_at       timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint shuttle_passengers_chk  check (passengers between 1 and 8),
  constraint shuttle_status_chk      check (status in ('requested', 'confirmed', 'cancelled')),
  constraint shuttle_arrival_chk     check (latest_arrival_at is null or latest_arrival_at >= pickup_at)
);

comment on table shuttle_booking is
  'Shuttle-Fahrten je Speaker-Profil (A7.1). Mehrere Fahrten je Speaker, auch Zwischenfahrten. Jede Fahrt wird vom Speaker-Team freigegeben. Felder nach der Airtable-Shuttle-Tabelle 2026.';
comment on column shuttle_booking.passenger_name is
  'Wer befördert wird — nicht zwingend der Speaker. Steht an der Fahrt, damit der Export ohne Personentabelle auskommt.';
comment on column shuttle_booking.over_limit_reason is
  'Begründung ab der sechsten nicht stornierten Fahrt (Obergrenze fünf, Konrad 17.09.).';
comment on column shuttle_booking.booked_by_email is
  'Dienstliche Adresse der anfordernden Person, von der Funktion gesetzt — keine Eingabe.';

create index if not exists shuttle_booking_profile_idx on shuttle_booking (profile_id, pickup_at);
create index if not exists shuttle_booking_status_idx  on shuttle_booking (status, pickup_at);

alter table shuttle_booking enable row level security;

-- Gelesen und geschrieben wird ausschliesslich über die RPCs unten. RLS ohne
-- Policy sperrt zwar schon, aber die Default-Privilegien des Schemas blieben
-- sonst stehen — wir nehmen beides (db-konventionen §5).
revoke all on shuttle_booking from anon, authenticated;

-- `set_updated_at()` gibt es seit Schema v2. Eine eigene Kopie waere eine
-- zweite Stelle, an der dasselbe passiert (Review Architektur-Session).
drop trigger if exists trg_shuttle_booking_touch on shuttle_booking;
create trigger trg_shuttle_booking_touch before update on shuttle_booking
  for each row execute function set_updated_at();

-- === Rechte ==================================================================

/**
 * Darf diese Person Fahrten dieses Profils anfordern und stornieren?
 *
 * Drei Wege, alle schon vorhanden: der Speaker selbst, seine Assistenz, oder
 * wer ihn betreut (`can_manage_speaker` deckt Lead-Scope und Team ab). Eine
 * eigene Regel danebenzustellen hiesse, zwei Wahrheiten darüber zu haben, wer
 * für einen Speaker handeln darf.
 */
create or replace function can_request_shuttle(p_profile_id uuid) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_person uuid; v_assistant uuid;
begin
  if v_me is null then return false; end if;
  select sp.person_id, sp.assistant_person_id into v_person, v_assistant
    from speaker_profile sp where sp.id = p_profile_id;
  if not found then return false; end if;
  return v_person = v_me or v_assistant = v_me or can_manage_speaker(p_profile_id);
end $$;
revoke execute on function can_request_shuttle(uuid) from public, anon;

comment on function can_request_shuttle(uuid) is
  'Speaker, Assistenz oder betreuende Person. Freigeben darf nur das Team (confirm_shuttle).';

-- === Schreiben ===============================================================

/**
 * Eine Fahrt anfordern.
 *
 * Status ist **immer** `requested`, unabhängig davon, wer anfordert. Konrad
 * will jede Fahrt einmal gesehen haben, bevor sie ans Unternehmen geht; ein
 * Team-Sonderweg wäre die Lücke, durch die ungeprüfte Fahrten laufen.
 *
 * Die Obergrenze ist eine Schwelle, kein Riegel: ab der sechsten nicht
 * stornierten Fahrt verlangt die Funktion eine Begründung. Damit bleibt
 * „Weitere Fahrt beantragen" möglich und die Ausnahme sichtbar.
 */
create or replace function request_shuttle(p_profile_id uuid, p_data jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_me uuid := current_person_id(); v_id uuid; v_n integer; v_mail text;
  v_grund text; v_pickup timestamptz; v_latest timestamptz; v_pass integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from speaker_profile sp where sp.id = p_profile_id) then
    raise exception 'speaker_not_found' using errcode = 'P0002';
  end if;
  if not can_request_shuttle(p_profile_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_pickup := nullif(btrim(p_data->>'pickup_at'), '')::timestamptz;
  v_latest := nullif(btrim(p_data->>'latest_arrival_at'), '')::timestamptz;
  v_pass   := coalesce(nullif(btrim(p_data->>'passengers'), '')::integer, 1);
  v_grund  := nullif(btrim(p_data->>'over_limit_reason'), '');

  if nullif(btrim(p_data->>'passenger_name'), '') is null
     or v_pickup is null
     or nullif(btrim(p_data->>'pickup_location'), '') is null
     or nullif(btrim(p_data->>'dropoff_location'), '') is null then
    raise exception 'fields_required' using errcode = '22023',
      detail = 'passenger_name, pickup_at, pickup_location, dropoff_location';
  end if;
  if v_pass < 1 or v_pass > 8 then
    raise exception 'invalid_shuttle' using errcode = '22023', detail = 'passengers:' || v_pass::text;
  end if;
  if v_latest is not null and v_latest < v_pickup then
    raise exception 'invalid_shuttle' using errcode = '22023', detail = 'latest_arrival_at';
  end if;

  -- Obergrenze fünf (D8). Stornierte zählen nicht mit — sonst könnte niemand
  -- eine falsch eingetragene Fahrt zurücknehmen und neu anlegen.
  select count(*) into v_n from shuttle_booking b
   where b.profile_id = p_profile_id and b.status <> 'cancelled';
  if v_n >= 5 and v_grund is null then
    raise exception 'shuttle_limit' using errcode = 'P0001', detail = v_n::text;
  end if;

  -- Die Adresse der handelnden Person, nicht die aus der Eingabe: wer die
  -- Fahrt angefordert hat, soll nachvollziehbar bleiben.
  select pe.email::text into v_mail
    from person_email pe where pe.person_id = v_me and pe.is_primary limit 1;

  insert into shuttle_booking (
    profile_id, passenger_name, passengers, driver_phone, pickup_at,
    pickup_location, pickup_address, dropoff_location, dropoff_address,
    latest_arrival_at, booked_by_email, note, over_limit_reason, created_by
  ) values (
    p_profile_id,
    btrim(p_data->>'passenger_name'),
    v_pass,
    nullif(btrim(p_data->>'driver_phone'), ''),
    v_pickup,
    btrim(p_data->>'pickup_location'),
    nullif(btrim(p_data->>'pickup_address'), ''),
    btrim(p_data->>'dropoff_location'),
    nullif(btrim(p_data->>'dropoff_address'), ''),
    v_latest,
    v_mail,
    nullif(btrim(p_data->>'note'), ''),
    case when v_n >= 5 then v_grund end,
    v_me
  ) returning id into v_id;

  perform log_audit('speaker.shuttle_requested', 'shuttle_booking', v_id::text, null,
    jsonb_build_object('profile_id', p_profile_id, 'pickup_at', v_pickup,
                       'over_limit', v_n >= 5, 'count_before', v_n));

  return jsonb_build_object('id', v_id, 'status', 'requested', 'count_before', v_n);
end $$;

comment on function request_shuttle(uuid, jsonb) is
  'Fahrt anfordern (Speaker, Assistenz, betreuende Person, Team). Immer Status requested; ab der sechsten nicht stornierten Fahrt ist eine Begründung Pflicht.';

/** Eine Fahrt stornieren. Wer anfordern darf, darf auch zurücknehmen. */
create or replace function cancel_shuttle(p_booking_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_b shuttle_booking%rowtype;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_b from shuttle_booking where id = p_booking_id for update;
  if not found then raise exception 'shuttle_not_found' using errcode = 'P0002'; end if;
  if not can_request_shuttle(v_b.profile_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_b.status = 'cancelled' then return; end if;

  update shuttle_booking set status = 'cancelled', cancelled_at = now() where id = p_booking_id;
  perform log_audit('speaker.shuttle_cancelled', 'shuttle_booking', p_booking_id::text,
    jsonb_build_object('status', v_b.status), jsonb_build_object('status', 'cancelled'));
end $$;

/**
 * Eine Fahrt freigeben — nur das Speaker-Team.
 *
 * Das ist der Schritt, den Konrad ausdrücklich verlangt hat: keine Fahrt geht
 * ans Unternehmen, die nicht einmal jemand angesehen hat.
 */
create or replace function confirm_shuttle(p_booking_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_b shuttle_booking%rowtype; v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Erst die Fahrt, dann die Rechte: `is_speaker_team` ist editionsbezogen und
  -- weiss ohne die Buchung nicht, worueber es entscheiden soll.
  select * into v_b from shuttle_booking where id = p_booking_id for update;
  if not found then raise exception 'shuttle_not_found' using errcode = 'P0002'; end if;
  select sp.edition_id into v_ed from speaker_profile sp where sp.id = v_b.profile_id;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_b.status <> 'requested' then
    raise exception 'shuttle_not_open' using errcode = 'P0001', detail = v_b.status;
  end if;

  update shuttle_booking
     set status = 'confirmed', confirmed_by = current_person_id(), confirmed_at = now()
   where id = p_booking_id;
  perform log_audit('speaker.shuttle_confirmed', 'shuttle_booking', p_booking_id::text,
    jsonb_build_object('status', v_b.status), jsonb_build_object('status', 'confirmed'));
end $$;

-- === Lesen ===================================================================

/** Die eigenen Fahrten — Speaker und Assistenz. */
create or replace function my_shuttle_bookings()
returns table (id uuid, passenger_name text, passengers integer, driver_phone text,
               pickup_at timestamptz, pickup_location text, pickup_address text,
               dropoff_location text, dropoff_address text, latest_arrival_at timestamptz,
               status text, note text, over_limit_reason text, created_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select b.id, b.passenger_name, b.passengers, b.driver_phone, b.pickup_at,
         b.pickup_location, b.pickup_address, b.dropoff_location, b.dropoff_address,
         b.latest_arrival_at, b.status, b.note, b.over_limit_reason, b.created_at
    from shuttle_booking b
   where b.profile_id = my_speaker_profile_id()
   order by b.pickup_at
$$;

/**
 * Die Fahrten der betreuten Speaker — Lead-Portal (LEAD-011).
 *
 * Namen kommen als **benannte Spalten** aus `person`; seit 0100 stehen dort
 * Gesundheitsangaben, die ein `select *` oder `to_jsonb` mit herausgeben würde.
 */
create or replace function manager_shuttle_bookings(p_edition_id uuid default null)
returns table (id uuid, profile_id uuid, speaker_first_name text, speaker_last_name text,
               passenger_name text, passengers integer, driver_phone text,
               pickup_at timestamptz, pickup_location text, pickup_address text,
               dropoff_location text, dropoff_address text, latest_arrival_at timestamptz,
               status text, note text, over_limit_reason text, booked_by_email text,
               created_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select b.id, b.profile_id, p.first_name, p.last_name,
         b.passenger_name, b.passengers, b.driver_phone, b.pickup_at,
         b.pickup_location, b.pickup_address, b.dropoff_location, b.dropoff_address,
         b.latest_arrival_at, b.status, b.note, b.over_limit_reason, b.booked_by_email,
         b.created_at
    from shuttle_booking b
    join speaker_profile sp on sp.id = b.profile_id
    join person p           on p.id  = sp.person_id
   where can_manage_speaker(b.profile_id)
     and (p_edition_id is null or sp.edition_id = p_edition_id)
   order by b.pickup_at
$$;

/** Alle Fahrten einer Edition — Speaker-Admin, Grundlage für Freigabe und Export. */
create or replace function shuttle_bookings_admin(p_edition_id uuid default null)
returns table (id uuid, profile_id uuid, speaker_first_name text, speaker_last_name text,
               passenger_name text, passengers integer, driver_phone text,
               pickup_at timestamptz, pickup_location text, pickup_address text,
               dropoff_location text, dropoff_address text, latest_arrival_at timestamptz,
               status text, note text, over_limit_reason text, booked_by_email text,
               confirmed_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select coalesce(p_edition_id,
                  (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;
  if not is_speaker_team(v_ed) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select b.id, b.profile_id, p.first_name, p.last_name,
           b.passenger_name, b.passengers, b.driver_phone, b.pickup_at,
           b.pickup_location, b.pickup_address, b.dropoff_location, b.dropoff_address,
           b.latest_arrival_at, b.status, b.note, b.over_limit_reason, b.booked_by_email,
           b.confirmed_at, b.created_at
      from shuttle_booking b
      join speaker_profile sp on sp.id = b.profile_id
      join person p           on p.id  = sp.person_id
     where sp.edition_id = v_ed
     order by b.pickup_at;
end $$;

comment on function shuttle_bookings_admin(uuid) is
  'Alle Fahrten einer Edition für das Speaker-Team. Grundlage der Freigabe und des Exports ans Shuttle-Unternehmen (ADM-028).';

select harden_definer_functions();
