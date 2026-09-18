-- =============================================================================
-- 0115 · Welle 6 · Profil löschen (ADM-031, Art. 17 DSGVO)
--
-- Angewendet von der Architektur-Session am 18.09.2026 als 20260918105546.
--
-- `delete_my_profile()` ist seit 0002 gebaut, freigegeben — und wird von
-- **keiner** Seite aufgerufen. Es gibt heute keinen Weg, ein Profil löschen zu
-- lassen. Das ist kein fehlendes Feature, das ist ein fehlendes Recht.
--
-- **Sofort oder auf Antrag — beides, je nachdem.** Wer nur Teilnehmer ist, löscht
-- selbst und sofort; niemand soll auf eine Freigabe warten, um zu gehen. Wer
-- aber im Team steht, als Speaker zugesagt hat, als Volunteer eingeteilt ist
-- oder eine Organisation vertritt, kann nicht wortlos verschwinden: an diesen
-- Personen hängen Zusagen gegenüber Dritten. Dann entsteht ein **Antrag**, das
-- Team sieht ihn in einer Warteschlange und löst ihn auf — mit Löschung oder
-- mit einer Begründung.
--
-- Die Hürden stehen in `my_deletion_blockers()` und werden der Person **vorher
-- genannt**. Niemand soll auf einen Knopf drücken und dann etwas anderes
-- passieren sehen, als der Knopf versprochen hat.
--
-- **Keine Bestätigungsmail an die gelöschte Adresse.** Das Löschen setzt die
-- Adresse auf die Sperrliste; eine Mail danach würde als `suppressed`
-- protokolliert und nie ankommen. Die Bestätigung steht deshalb auf dem
-- Bildschirm. Nur beim **Antrag** geht eine Mail heraus — da ist noch nichts
-- gelöscht.
--
-- **Was „anonymisieren" umfasst, steht in einer Tabelle im PR.** Die Routine
-- aus Welle 1 räumte nur `person` und ein paar Nebentabellen; Ernährung,
-- Geschlecht, Anrede und Selbsteinschätzung blieben stehen, ebenso die Adresse
-- im Mail-Protokoll, sämtliche Freitexte am Speaker-Profil, die Bankdaten am
-- Reisekostenantrag und die Inhabernamen am Ticket. Sie geht jetzt über alle
-- 16 Tabellen mit `person_id` und die Kinder von `speaker_profile`. Grobe
-- Merkmale (career_level, study_field, country, tier) bleiben für die
-- Statistik — sie beschreiben eine Gruppe, keinen Menschen; Freitext und
-- Art.-9-Felder gehen (Auflage der Architektur-Session, 18.09.).
--
-- **Zwei Dinge kann SQL nicht:** Dateien im Bucket löschen — dafür trägt die
-- RPC die Pfade in `storage_purge_queue` ein und der Cron räumt sie mit
-- `service_role` weg —, und Kopien in Fremdsystemen entfernen. Die
-- vivenu-Tickets tragen dort weiterhin Name und Adresse; der lokale Verweis
-- fällt weg, die Löschung drüben ist ein eigener Vorgang und gehört in die
-- Betriebsdoku, nicht in diese Migration.
--
-- **Ein offener Reisekostenantrag ist eine Hürde.** Sonst müsste die Routine
-- entscheiden, ob Bankdaten noch gebraucht werden. So ist die Antwort immer
-- nein: bezahlt ist bezahlt, der Vault-Eintrag fällt, der Antrag bleibt als
-- Buchung stehen (§147 AO).
--
-- **`delete_my_profile()` ist nicht mehr freigegeben.** Sie prüft die Hürden
-- nicht; der einzige Weg von aussen ist `request_profile_deletion()`.
--
-- **Kein Personenbezug überlebt die Löschung.** `resolve_deletion_request()`
-- protokolliert Bearbeiter, Vorgang und Hürden — nicht den gelöschten
-- Datensatz; sonst stünde die Person nach ihrer Löschung im Audit-Log. Aus
-- demselben Grund fällt der selbst geschriebene Grund beim Anonymisieren weg,
-- während Status, Hürden und Zeitpunkt als Nachweis bleiben (Auflage der
-- Architektur-Session, 18.09.).
--
-- **Was Löschen hier heisst:** anonymisieren, nicht physisch entfernen. Der
-- Datensatz bleibt ohne Personenbezug bestehen, damit Zahlen, Bestellungen und
-- Protokolle stimmig bleiben; Name, Kontaktdaten und Zugang fallen weg, die
-- Adresse kommt als Hash auf die Sperrliste. Das ist die Entscheidung vom
-- 08.09. und bleibt so.
--
-- Fehlerschlüssel: 28000 ohne Login · 42501 ohne Admin ·
-- P0001 `already_requested` · 22023 `invalid_action` ·
-- P0002 `request_not_found`.
--
-- Test: supabase/tests/v6_profil_loeschen.sql
-- =============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------- Tabelle

create table if not exists profile_deletion_request (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references person (id) on delete cascade,
  -- Warum jemand geht, ist freiwillig. Das Feld ist keine Pflicht und wird
  -- nicht ausgewertet — es steht da, weil die Antwort dem Team hilft.
  reason        text,
  -- Was der Löschung im Weg stand, als der Antrag entstand. Als Momentaufnahme
  -- festgehalten: wer den Antrag später ansieht, soll wissen, warum er
  -- überhaupt einer wurde.
  blockers      text[] not null default '{}',
  status        text not null default 'pending' check (status in ('pending', 'done', 'rejected')),
  requested_at  timestamptz not null default now(),
  handled_by    uuid references person (id) on delete set null,
  handled_at    timestamptz,
  handled_note  text
);
-- Ein offener Antrag je Person reicht.
create unique index if not exists profile_deletion_request_offen_uidx
  on profile_deletion_request (person_id) where status = 'pending';
create index if not exists profile_deletion_request_status_idx
  on profile_deletion_request (status, requested_at desc);
comment on table profile_deletion_request is
  'Antraege auf Profilloeschung nach Art. 17 DSGVO (0115). Entsteht nur, wenn der Loeschung etwas entgegensteht — sonst loescht die Person selbst und sofort.';

alter table profile_deletion_request enable row level security;
revoke all on profile_deletion_request from anon, authenticated;

-- Kein Policy-Block: gelesen und geschrieben wird ausschliesslich über die
-- RPCs unten. Eine Lesepolicy für `authenticated` wäre eine Liste, wer gehen
-- möchte — die geht niemanden ausser dem Team etwas an.

-- ------------------------------------------------- Dateien zum Wegräumen

/**
 * Was im Bucket liegt, kann SQL nicht löschen.
 *
 * Die RPC trägt die Pfade hier ein, der Cron räumt sie mit `service_role` weg
 * und löscht die Zeile. Ohne diese Zwischenablage bliebe das Bewerbungsfoto
 * einer gelöschten Person im Speicher liegen — unerreichbar über die App, aber
 * vorhanden, und das ist nicht dasselbe wie gelöscht.
 */
create table if not exists storage_purge_queue (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null,
  path         text not null,
  reason       text not null default 'profile_deleted',
  requested_at timestamptz not null default now(),
  -- Ein fehlgeschlagener Versuch bleibt stehen, mit Zähler und Fehlertext. Eine
  -- Zeile, die nicht verschwindet, ist der einzige Hinweis darauf, dass eine
  -- Datei im Bucket liegen geblieben ist — sie stumm zu löschen wäre schlimmer
  -- als sie stehen zu lassen.
  attempts     integer not null default 0,
  error        text,
  unique (bucket, path)
);
create index if not exists storage_purge_queue_offen_idx
  on storage_purge_queue (requested_at) where attempts < 5;
comment on table storage_purge_queue is
  'Dateipfade, die nach einer Profilloeschung aus dem Bucket muessen (0115). SQL kann Storage nicht loeschen; der Cron raeumt mit service_role und loescht die Zeile.';

alter table storage_purge_queue enable row level security;
revoke all on storage_purge_queue from anon, authenticated;
-- Keine Policy: nur `service_role` (Cron) und die SECURITY-DEFINER-Funktionen
-- unten fassen die Tabelle an. Eine Leseberechtigung wäre eine Liste der
-- Dateien, die gerade verschwinden sollen.

-- ---------------------------------------------------------------- Hürden

/**
 * Was einer sofortigen Löschung im Weg steht.
 *
 * Bewusst knapp: vier Schlüssel, die die Oberfläche in einen Satz übersetzt.
 * Wer nichts davon trifft, löscht selbst.
 */
create or replace function my_deletion_blockers() returns text[]
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_out text[] := '{}';
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  -- Teamrolle: wer den Betrieb mitträgt, verschwindet nicht per Selbstbedienung.
  if exists (
    select 1 from role_assignment ra
     where ra.person_id = v_me and ra.role = any (team_role_keys())
       and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now()))
  then v_out := array_append(v_out, 'team_role'); end if;

  -- Zugesagter Auftritt einer Edition, die noch bevorsteht.
  if exists (
    select 1 from speaker_profile sp join event e on e.id = sp.edition_id
     where (sp.person_id = v_me or sp.assistant_person_id = v_me)
       and sp.confirmed_at is not null and sp.declined_at is null
       and e.end_date >= current_date)
  then v_out := array_append(v_out, 'speaker'); end if;

  -- Angenommene Volunteer-Bewerbung einer Edition, die noch bevorsteht.
  if exists (
    select 1 from volunteer_profile vp join event e on e.id = vp.edition_id
     where vp.person_id = v_me and vp.status = 'accepted' and e.end_date >= current_date)
  then v_out := array_append(v_out, 'volunteer'); end if;

  -- Ansprechperson einer Organisation: an der Stelle hängt ein Vertrag.
  if exists (select 1 from org_membership om where om.person_id = v_me)
  then v_out := array_append(v_out, 'partner'); end if;

  -- Offener Reisekostenantrag: eine Zahlung, die uns die Person noch schuldet
  -- oder wir ihr. Bis die durch ist, kann niemand verschwinden — und danach
  -- dürfen die Bankdaten weg, ohne dass eine Erstattung ins Leere läuft.
  if exists (
    select 1 from expense_claim ec join speaker_profile sp on sp.id = ec.profile_id
     where sp.person_id = v_me and ec.paid_at is null
       and ec.status not in ('rejected', 'cancelled', 'draft'))
  then v_out := array_append(v_out, 'open_expense'); end if;

  return v_out;
end $$;
grant execute on function my_deletion_blockers() to authenticated;

-- ---------------------------------------------------------------- Löschen

/**
 * Anonymisieren — derselbe Ablauf wie `delete_my_profile()`, nur für eine
 * benannte Person.
 *
 * Nicht freigegeben: gerufen wird sie von `delete_my_profile()` (für einen
 * selbst) und von `resolve_deletion_request()` (nach Rechteprüfung). Ohne
 * diese Trennung müsste der Ablauf zweimal gepflegt werden, und die zweite
 * Fassung wäre die, die man beim nächsten Feld vergisst.
 */
create or replace function anonymize_person(p_person_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
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

  -- 3 · Zeilen, die ohne die Person keinen Sinn mehr haben.
  delete from person_interest            where person_id = p_person_id;
  delete from person_acquisition_channel where person_id = p_person_id;
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
    linkedin_url = null, linkedin_normalized = null, cv_url = null,
    employer_name = null, university = null, title = null, city = null, pronouns = null,
    nationality = null, invite_code = null, auth_user_id = null,
    gender = null, diet = null, diet_note = null,
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
  update hack_application set motivation = null, team_pref = null, note = null where person_id = p_person_id;
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

  -- 7 · Speaker-Profil und was daran hängt.
  update speaker_profile set
    bio_short_de = null, bio_short_en = null, bio_long_de = null, bio_long_en = null,
    job_title = null, organization_name = null, internal_notes = null,
    -- `tech_rider` und `socials` sind `not null default '{}'` — hier gehoert der
    -- leere Wert hin, nicht `null` (Probelauf der Architektur-Session, 23502).
    tech_rider = '{}'::jsonb, socials = '{}'::jsonb,
    decline_reason = null, photo_asset_id = null
   where person_id = p_person_id;
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
end $$;
revoke execute on function anonymize_person(uuid) from public, anon, authenticated;

/**
 * Das eigene Profil löschen.
 *
 * Gleiche Wirkung wie bisher, der Ablauf steht jetzt in `anonymize_person()`.
 * Die Hürden prüft diese Funktion **nicht** — das tut `request_profile_deletion()`,
 * und nur die ruft die Oberfläche. Wer die RPC direkt ruft, löscht sich selbst;
 * das war vorher so und bleibt so.
 */
create or replace function delete_my_profile() returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_pid uuid := current_person_id();
begin
  if v_pid is null then raise exception 'no person for current user' using errcode = '28000'; end if;
  perform anonymize_person(v_pid);
end $$;
-- **Nicht mehr freigegeben.** Sie prüft die Hürden nicht; wer sie direkt riefe,
-- ginge an `request_profile_deletion()` vorbei — ein zugesagter Speaker könnte
-- sich vier Wochen vor dem Summit selbst löschen. Die Oberfläche braucht sie
-- nicht mehr. Die Signatur bleibt bestehen, weil ein ersatzloses `drop` eine
-- seit Welle 1 dokumentierte Funktion aus der Welt nähme (Auflage der
-- Architektur-Session, 18.09.).
revoke execute on function delete_my_profile() from public, anon, authenticated;

-- ---------------------------------------------------------------- Antrag

/**
 * Löschung auslösen.
 *
 * Ohne Hürden: sofort gelöscht, der Vorgang steht mit `done` in der Tabelle —
 * die Person ist danach anonym, aber dass jemand am 17.09. eine Löschung
 * ausgelöst hat, bleibt nachweisbar. Mit Hürden: ein Antrag mit `pending`, das
 * Team wird benachrichtigt.
 *
 * Rückgabe `done` oder `pending`, damit die Oberfläche den richtigen Satz
 * zeigt und nicht raten muss.
 */
create or replace function request_profile_deletion(p_reason text default null) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_b text[]; v_id uuid; v_admin uuid; v_name text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from profile_deletion_request r where r.person_id = v_me and r.status = 'pending') then
    raise exception 'already_requested' using errcode = 'P0001';
  end if;
  v_b := my_deletion_blockers();

  insert into profile_deletion_request (person_id, reason, blockers, status)
  values (v_me, nullif(btrim(coalesce(p_reason, '')), ''), v_b,
          case when cardinality(v_b) = 0 then 'done' else 'pending' end)
  returning id into v_id;

  if cardinality(v_b) = 0 then
    -- Selbst gelöscht: der Vorgang gilt als erledigt, erledigt hat ihn die
    -- Person selbst.
    update profile_deletion_request set handled_by = v_me, handled_at = now() where id = v_id;
    perform anonymize_person(v_me);
    return 'done';
  end if;

  -- Antrag: die Person bekommt eine Bestätigung, das Team eine Nachricht.
  select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    into v_name from person p where p.id = v_me;
  perform queue_mail('deletion_requested', v_me, '{}'::jsonb, 'deletion_request', v_id);
  for v_admin in
    select distinct ra.person_id from role_assignment ra
     where ra.role = 'admin' and ra.valid_from <= now()
       and (ra.valid_to is null or ra.valid_to > now())
  loop
    -- **Ohne Bezug.** `queue_mail` unterdrückt einen zweiten Auftrag zur
    -- gleichen Vorlage und demselben Objekt — mit `v_id` als Bezug bekäme nur
    -- die erste Admin-Person die Nachricht, und niemand merkte es.
    perform queue_mail('deletion_request_team', v_admin,
                       jsonb_build_object('person_name', coalesce(v_name, '—'),
                                          'blockers', array_to_string(v_b, ', ')));
  end loop;

  perform log_audit('profile.delete_requested', 'person', v_me::text, null,
                    jsonb_build_object('request_id', v_id, 'blockers', to_jsonb(v_b)));
  return 'pending';
end $$;
grant execute on function request_profile_deletion(text) to authenticated;

/** Der eigene Stand: läuft ein Antrag, und was stünde einer Löschung im Weg? */
create or replace function my_deletion_status() returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := current_person_id(); v_r profile_deletion_request%rowtype;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_r from profile_deletion_request r
   where r.person_id = v_me and r.status = 'pending' limit 1;
  return jsonb_build_object(
    'blockers', to_jsonb(my_deletion_blockers()),
    'pending_since', v_r.requested_at);
end $$;
grant execute on function my_deletion_status() to authenticated;

-- ---------------------------------------------------------------- Warteschlange

/** Die Warteschlange im Admin. Nennt Namen und Adresse — deshalb nur Admin. */
create or replace function deletion_requests_admin(p_status text default 'pending')
returns table (id uuid, person_id uuid, person_name text, email text, reason text,
               blockers text[], status text, requested_at timestamptz,
               handled_by_name text, handled_at timestamptz, handled_note text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select r.id, r.person_id,
           nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           (select pe.email::text from person_email pe
             where pe.person_id = r.person_id and pe.is_primary),
           r.reason, r.blockers, r.status, r.requested_at,
           nullif(btrim(coalesce(h.first_name, '') || ' ' || coalesce(h.last_name, '')), ''),
           r.handled_at, r.handled_note
      from profile_deletion_request r
      join person p on p.id = r.person_id
      left join person h on h.id = r.handled_by
     where p_status is null or r.status = p_status
     order by r.requested_at desc;
end $$;
grant execute on function deletion_requests_admin(text) to authenticated;

/**
 * Einen Antrag auflösen: löschen oder mit Begründung ablehnen.
 *
 * `reject` ist kein Nein zum Recht, sondern ein Nein zum jetzigen Zeitpunkt —
 * etwa, solange ein zugesagter Auftritt noch bevorsteht. Die Begründung ist
 * deshalb **Pflicht**: sie geht als Antwort an die Person.
 */
create or replace function resolve_deletion_request(p_id uuid, p_action text, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_r profile_deletion_request%rowtype; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not has_role('admin') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_action not in ('delete', 'reject') then
    raise exception 'invalid_action' using errcode = '22023', detail = coalesce(p_action, 'null');
  end if;
  select * into v_r from profile_deletion_request where id = p_id and status = 'pending';
  if not found then raise exception 'request_not_found' using errcode = 'P0002', detail = p_id::text; end if;
  if p_action = 'reject' and v_note is null then
    raise exception 'note_required' using errcode = '22023';
  end if;

  if p_action = 'reject' then
    -- Erst die Antwort einreihen, dann schliessen: die Adresse lebt noch.
    perform queue_mail('deletion_rejected', v_r.person_id,
                       jsonb_build_object('note', v_note), 'deletion_request', v_r.id);
  end if;

  update profile_deletion_request
     set status = case when p_action = 'delete' then 'done' else 'rejected' end,
         handled_by = current_person_id(), handled_at = now(), handled_note = v_note
   where id = p_id;

  if p_action = 'delete' then perform anonymize_person(v_r.person_id); end if;

  perform log_audit('profile.delete_resolved', 'person', v_r.person_id::text,
                    jsonb_build_object('request_id', v_r.id, 'blockers', to_jsonb(v_r.blockers)),
                    jsonb_build_object('action', p_action, 'note', v_note));
end $$;
grant execute on function resolve_deletion_request(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------- Mail

insert into mail_template (key, locale, version, subject, body_md, description, active)
select v.key, v.locale, v.version, v.subject, v.body_md, v.description, v.active
from (values
  ('deletion_requested', 'de', 1, 'Deine Anfrage zur Profillöschung ist da',
   E'Hallo {{first_name}},\n\nwir haben deine Anfrage erhalten, dein Profil zu löschen.\n\nWeil an deinem Profil noch etwas hängt — eine Rolle, eine Zusage oder eine Organisation —, sieht sich jemand aus dem Team die Anfrage an und meldet sich bei dir. Bis dahin ändert sich nichts an deinem Zugang.\n\nViele Grüße\nChefTreff',
   'Bestaetigung an die Person, wenn ein Loeschantrag entsteht', true),
  ('deletion_requested', 'en', 1, 'We received your deletion request',
   E'Hi {{first_name}},\n\nwe received your request to delete your profile.\n\nBecause something is still attached to it — a role, a confirmed session or an organisation — someone from the team will look at it and get back to you. Until then nothing changes about your access.\n\nBest\nChefTreff',
   'Confirmation to the person when a deletion request is created', true),
  ('deletion_request_team', 'de', 1, 'Löschantrag: {{person_name}}',
   E'Hallo {{first_name}},\n\n{{person_name}} möchte das Profil löschen lassen. Offen ist: {{blockers}}.\n\n[Antrag ansehen]({{portal_url}}/admin/loeschantraege)\n\nViele Grüße\nChefTreff',
   'Nachricht an die Admins, wenn ein Loeschantrag entsteht', true),
  ('deletion_request_team', 'en', 1, 'Deletion request: {{person_name}}',
   E'Hi {{first_name}},\n\n{{person_name}} would like their profile deleted. Still open: {{blockers}}.\n\n[View request]({{portal_url}}/admin/loeschantraege)\n\nBest\nChefTreff',
   'Notice to admins when a deletion request is created', true),
  ('deletion_rejected', 'de', 1, 'Zu deiner Anfrage zur Profillöschung',
   E'Hallo {{first_name}},\n\nwir können dein Profil im Moment nicht löschen. Der Grund:\n\n{{note}}\n\nWenn du damit nicht einverstanden bist, antworte einfach auf diese Mail.\n\nViele Grüße\nChefTreff',
   'Antwort an die Person, wenn ein Loeschantrag abgelehnt wird', true),
  ('deletion_rejected', 'en', 1, 'About your deletion request',
   E'Hi {{first_name}},\n\nwe cannot delete your profile at the moment. The reason:\n\n{{note}}\n\nIf you disagree, just reply to this mail.\n\nBest\nChefTreff',
   'Reply to the person when a deletion request is rejected', true)
) as v(key, locale, version, subject, body_md, description, active)
where not exists (select 1 from mail_template t where t.key = v.key and t.locale = v.locale);

select harden_definer_functions();
