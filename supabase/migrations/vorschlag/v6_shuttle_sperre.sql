-- 02NN · Shuttle-Sperre ab Beginn der Shuttle-Periode (LEAD-065, K-64)
-- Nummer und Zeitstempel vergibt die Architektur-Session beim Anwenden.
--
-- Anlass: K-64 (Konrad 08.10.2026): Die finale Freigabe der Shuttle-Fahrten bleibt beim Speaker-Team (Paulina). Ab einem Zeitpunkt — dem Beginn der
-- Shuttle-Periode — werden neue Anfragen und Änderungen im Portal gesperrt; stattdessen steht dort ein Hinweis „Anfragen ab jetzt direkt über <Name>“ mit
-- Telefon und E-Mail des Kontakts `speaker_lead`. Datenmodell mit Plan abgestimmt (09.10.2026): Funktionen, die Frist ist eine Systemfrist.
-- Antworten von Plan: (a) auch das Stornieren ist gesperrt, (b) Stage Leads in ihrem Portal ebenso, (c) kein Testdaten-Schritt, der die Frist anlegt
-- (sie wirkt für alle Speaker der Edition — Klickanleitung im Testleitfaden), (d) Name, Telefon und E-Mail kommen aus dem Kontakt.
--
-- Was die Migration tut (Funktionen und **eine Seed-Zeile je Edition** — keine Tabelle, keine Spalte)
--   1  Die **Frist** `shuttle_lock_from` (Systemfrist, Zielgruppe Speaker). **Abweichung von der Kurzfassung (Befund beim Bau):** die Oberfläche kann keine
--      Systemfrist anlegen — der Baustein der Fristen (ADM-099) legt nur eigene Fristen mit dem Schlüssel `custom_<slug>` an, und der Schlüssel „steht nirgends“.
--      Darum legt diese Migration die Zeile je Edition an (wie `award_vote_from` in `v6_challenge_frist`), **mit dem Datum 31.12.2099**: so ist nichts
--      gesperrt, und das Team sieht die Frist unter /admin/fristen (Reiter Speaker) und setzt dort den Beginn der Shuttle-Periode. Löschen lässt sich eine
--      Systemfrist nicht. **Fehlt die Zeile, gibt es keine Sperre** (der Code verlässt sich nicht auf den Seed). Die Speaker-Startseite liest Fristen nur über
--      bekannte Schlüssel — der neue steht dort nirgends. `shuttle_lock_at(Profil)` liest den Zeitpunkt der Edition des Profils, `shuttle_locked(Profil)`
--      sagt, ob er erreicht ist, `shuttle_lock_text(Profil)` nennt ihn als Text („2027-04-01 09:00“, Zeit der Veranstaltung) für die Fehlermeldung. Alle
--      drei sind intern (kein EXECUTE für Aufrufer).
--   2  `request_shuttle` und `cancel_shuttle` (aus dem Snapshot nach 0295, je ein eingefügter Block nach der Rechteprüfung) weisen ab dem Zeitpunkt
--      mit **P0001 `shuttle_locked`** ab (detail = Zeitpunkt) — für jeden, der nicht zum Speaker-Team gehört (`is_speaker_team`: admin, Bereichsleitung
--      Speaker, Programm-Team). Das Team trägt Fahrten weiter ein und storniert sie. `confirm_shuttle` (die finale Freigabe) bleibt unberührt.
--   3  Neu lesend `shuttle_lock_status(Profil)`: `locked` (**für den Aufrufer** — das Team bekommt immer `false`), `lock_from` (der Zeitpunkt der Frist, auch
--      vor Erreichen) und der Kontakt, an den der Hinweis verweist (Name, Telefon, E-Mail): der Kontakt `speaker_lead`, den das Profil zugeordnet hat,
--      sonst der Standard der Edition — dieselbe Wahl wie `my_contacts()`. **Warum der Kontakt hier mitkommt (Abweichung von der Kurzfassung):** ein Stage
--      Lead hat kein eigenes Speaker-Profil, `my_contacts()` liefert ihm nichts; mit dem Profil des Speakers, für den er anfordert, bekommt er denselben
--      Kontakt wie der Speaker. Recht wie `can_request_shuttle` (Speaker, Assistenz, Betreuer, Team); sonst 42501 — auch für eine unbekannte Profil-Id,
--      denn `can_request_shuttle` ist dann falsch (kein Hinweis, ob es sie gibt).
--
-- Fehlerschlüssel: 28000 · 42501 · P0001 `shuttle_locked` (detail = Sperrzeitpunkt, Zeit der Veranstaltung) · alle bisherigen unverändert.
-- Ein abgewiesener Versuch wird nicht protokolliert (Plan 09.10.).
--
-- Basis: Snapshot nach 0295 (`request_shuttle`, `cancel_shuttle`); `can_request_shuttle`, `is_speaker_team` und `my_contacts` unverändert.
set search_path = public, extensions;

-- === 1 · Die Frist ===================================================================================================================
-- Eine Zeile je Edition, mit dem Datum 31.12.2099: nichts ist gesperrt, bis das Team den Beginn der Shuttle-Periode setzt (/admin/fristen, Reiter Speaker).
-- Der Schlüssel ist eine Code-Schnittstelle und steht in keiner Oberfläche; Zielgruppe und Schlüssel einer Systemfrist sind fest, löschen geht nicht.
insert into deadline (edition_id, key, audience, due_at, label_de, label_en, description_de, description_en, custom)
select e.id, 'shuttle_lock_from', 'speaker', timestamptz '2099-12-31 12:00:00+00',
       'Shuttle: Anfragen im Portal gesperrt ab',
       'Shuttle: requests in the portal locked from',
       'Ab diesem Zeitpunkt legen Speaker, Assistenz und Leads im Portal keine neuen Fahrten mehr an und ändern keine — Anfragen laufen dann über das Speaker-Team. Solange hier der 31.12.2099 steht, ist nichts gesperrt: setze den Beginn der Shuttle-Periode.',
       'From this time on, speakers, assistants and leads no longer create or change rides in the portal — requests go through the speaker team. While this shows 31 December 2099, nothing is locked: set the start of the shuttle period.',
       false
  from event e
 where e.is_edition
on conflict (edition_id, key) do nothing;

/** Der Zeitpunkt der Frist `shuttle_lock_from` in der Edition des Profils; NULL ohne Frist (dann gibt es keine Sperre). */
create or replace function shuttle_lock_at(p_profile_id uuid) returns timestamptz
 language sql stable security definer set search_path to 'public', 'extensions' as $$
  select d.due_at
    from speaker_profile sp
    join deadline d on d.edition_id = sp.edition_id and d.key = 'shuttle_lock_from'
   where sp.id = p_profile_id
$$;
revoke execute on function shuttle_lock_at(uuid) from public, anon, authenticated;

/** Ist der Sperrzeitpunkt erreicht? Ohne Frist: nein. */
create or replace function shuttle_locked(p_profile_id uuid) returns boolean
 language sql stable security definer set search_path to 'public', 'extensions' as $$
  select coalesce(shuttle_lock_at(p_profile_id) <= now(), false)
$$;
revoke execute on function shuttle_locked(uuid) from public, anon, authenticated;

/** Der Sperrzeitpunkt als Text in der Zeit der Veranstaltung („2027-04-01 09:00“) — das `detail` der Fehlermeldung. */
create or replace function shuttle_lock_text(p_profile_id uuid) returns text
 language sql stable security definer set search_path to 'public', 'extensions' as $$
  select coalesce(
           to_char(shuttle_lock_at(p_profile_id) at time zone coalesce((select e.timezone from speaker_profile sp join event e on e.id = sp.edition_id
                                                                          where sp.id = p_profile_id), 'Europe/Berlin'), 'YYYY-MM-DD HH24:MI'),
           'null')
$$;
revoke execute on function shuttle_lock_text(uuid) from public, anon, authenticated;

-- === 2 · Anfragen und Stornieren ab dem Zeitpunkt nur noch über das Team (Basis: Snapshot nach 0295) =======================================
create or replace function request_shuttle(p_profile_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_id uuid; v_n integer; v_mail text;
  v_grund text; v_pickup timestamptz; v_latest timestamptz; v_pass integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from speaker_profile sp where sp.id = p_profile_id) then
    raise exception 'speaker_not_found' using errcode = 'P0002';
  end if;
  -- Zweite Linie: sollte die Funktion je wieder NULL liefern, faellt der
  -- Aufruf auf `false` und nicht durch die Pruefung hindurch.
  if not coalesce(can_request_shuttle(p_profile_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- LEAD-065 (K-64): ab Beginn der Shuttle-Periode keine Anfragen mehr aus dem Portal — das Speaker-Team trägt Fahrten weiter ein.
  -- Gesperrt sind alle, die nicht zum Team gehören: Speaker, Assistenz und die Leads/Stage Leads in ihrem Portal.
  if shuttle_locked(p_profile_id) and not coalesce(is_speaker_team(null), false) then
    raise exception 'shuttle_locked' using errcode = 'P0001', detail = shuttle_lock_text(p_profile_id);
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

create or replace function cancel_shuttle(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_b shuttle_booking%rowtype;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_b from shuttle_booking where id = p_booking_id for update;
  if not found then raise exception 'shuttle_not_found' using errcode = 'P0002'; end if;
  if not coalesce(can_request_shuttle(v_b.profile_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- LEAD-065 (K-64): auch eine Stornierung ist eine Änderung — nach dem Sperrzeitpunkt nur noch über das Speaker-Team. Die Prüfung steht
  -- vor der Abfrage „schon storniert“, damit die Sperre für jeden Aufruf gleich antwortet.
  if shuttle_locked(v_b.profile_id) and not coalesce(is_speaker_team(null), false) then
    raise exception 'shuttle_locked' using errcode = 'P0001', detail = shuttle_lock_text(v_b.profile_id);
  end if;
  if v_b.status = 'cancelled' then return; end if;

  update shuttle_booking set status = 'cancelled', cancelled_at = now() where id = p_booking_id;
  perform log_audit('speaker.shuttle_cancelled', 'shuttle_booking', p_booking_id::text,
    jsonb_build_object('status', v_b.status), jsonb_build_object('status', 'cancelled'));
end $$;

-- === 3 · Der Stand fürs Portal =========================================================================================================
create or replace function shuttle_lock_status(p_profile_id uuid)
 returns table(locked boolean, lock_from timestamptz, contact_name text, contact_phone text, contact_email text)
 language plpgsql stable security definer set search_path to 'public', 'extensions' as $$
declare v_ed uuid; v_at timestamptz;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Wer für dieses Profil Fahrten anfordern darf, darf auch den Stand lesen — und niemand sonst. Eine unbekannte Id ist für jeden
  -- `can_request_shuttle` = falsch, also 42501: kein Hinweis, ob es sie gibt.
  if not coalesce(can_request_shuttle(p_profile_id), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  select sp.edition_id into v_ed from speaker_profile sp where sp.id = p_profile_id;
  v_at := shuttle_lock_at(p_profile_id);

  return query
    select (v_at is not null and v_at <= now() and not coalesce(is_speaker_team(null), false)),
           v_at,
           c.display_name,
           nullif(btrim(c.phone), ''),
           nullif(btrim(c.email::text), '')
      from (select 1) x
      left join lateral (
        -- Der Kontakt `speaker_lead`, den das Profil zugeordnet hat, sonst der Standard der Edition (wie `my_contacts()`).
        select ec.display_name, ec.phone, ec.email
          from edition_contact ec
         where ec.edition_id = v_ed and ec.type = 'speaker_lead'
           and ec.id = coalesce((select sp.lead_contact_id from speaker_profile sp where sp.id = p_profile_id),
                                (select d.id from edition_contact d where d.edition_id = v_ed and d.type = 'speaker_lead' and d.is_default limit 1))
      ) c on true;
end $$;
comment on function shuttle_lock_status(uuid) is
  'LEAD-065: Stand der Shuttle-Sperre fürs Portal — locked (für den Aufrufer; das Speaker-Team nie), lock_from (Zeitpunkt der Frist shuttle_lock_from, auch vor Erreichen) und der Kontakt speaker_lead, an den der Hinweis verweist. Recht wie can_request_shuttle.';

-- === 4 · Rechte =========================================================================================================================
-- `shuttle_lock_status` ist für `authenticated` ausführbar (anon nimmt harden_definer_functions); die drei Helfer sind intern (oben).

select harden_definer_functions();
