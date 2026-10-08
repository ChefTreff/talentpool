-- 0272 · Hackathon-Startseite als Event-Seite: Eckdaten, Ansprechperson, Zähler (HACK-020 für HACK-013)
-- Angewendet von der Architektur-Session am 08.10.2026 als 20261008083344.
-- Anlass: Design-Vorschlag docs/design-vorschlaege-2026-10-04.md (Konrad 04.10.: „passt“; K-59 08.10.:
-- Zahlen ab Mindestzahl 20). Die Teilnehmer-App kannte weder Termin noch Ort noch Ansprechperson.
--
-- **Keine neue Tabelle.** Die Hackathon-Zeile in `event` (format_tag hackathon) trägt Datum, Ort und Zeitzone
-- schon (`start_date`, `end_date`, `venue`, `location`, `timezone`); neu sind nur die Uhrzeiten und die
-- Zusatzzeile:
--   1 `event.start_time`, `event.end_time` (time, Ortszeit von `event.timezone`), `event.schedule_note_de/_en`
--     (≤ 200 Zeichen, z. B. „Kick-off 14:00 · Demos Samstag“). Pflege: `set_hackathon_info(p_data)` setzt alle acht
--     Felder (auch start_date/end_date, venue, location; is_hack_team, Audit `hack.info_set` nur mit Feldnamen) —
--     eine Karte „Eckdaten“ in /admin/hackathon. Fehler: `invalid_range`, `note_too_long`, `not_found`.
--   2 Ansprechperson: neuer Typ `hackathon_lead` in `edition_contact` (Vokabular `edition_contact_type`, CHECK,
--     und `upsert_edition_contact` — Live-Fassung aus dem Snapshot, einzige Änderung ist die Typliste). Pflege
--     wie bisher unter Admin → Ansprechpartner; dieselben Regeln (dienstliche Adresse oder `contract_consent_at`).
--   3 `hack_event_info(p_edition_id, p_language)` (nur wer das Portal sehen darf: hackathon_participant, hackathon_partner,
--     area_lead_hackathon oder Hack-Team, sonst 42501): Eckdaten, `starts_at`/`ends_at` aus Datum, Uhrzeit und Zone, Zusatzzeile in der Sprache, der Standard-
--     Kontakt vom Typ hackathon_lead und die Zähler `accepted` und `teams` — **beide null, solange weniger als
--     20 Bewerbungen angenommen sind** (K-59), nur Zahlen, keine Namen.
-- `my_hack` bleibt unverändert. Fehlerschlüssel neu: invalid_range, note_too_long (lib/rpc-error.ts + Wörterbücher).
-- Test: supabase/tests/v6_hack_eventseite.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1 · Eckdaten am Event

-- Datum, Ort und Zeitzone stehen schon an `event` (start_date, end_date, venue, location, timezone); neu nur
-- die Uhrzeiten (ohne zweite Quelle für das Datum) und die Zusatzzeile.
alter table event add column if not exists start_time time;
alter table event add column if not exists end_time time;
alter table event add column if not exists schedule_note_de text;
alter table event add column if not exists schedule_note_en text;
alter table event drop constraint if exists event_schedule_note_chk;
alter table event add constraint event_schedule_note_chk
  check (coalesce(length(schedule_note_de), 0) <= 200 and coalesce(length(schedule_note_en), 0) <= 200);
comment on column event.start_time is 'Uhrzeit des Beginns am start_date, Ortszeit von event.timezone — heute nur für den Hackathon gepflegt (HACK-020).';
comment on column event.schedule_note_de is 'Zusatzzeile unter den Eckdaten, z. B. Kick-off und Demos (HACK-020), höchstens 200 Zeichen.';

-- Eine Karte „Eckdaten“ pflegt alle Felder; nur die Hackathon-Zeile der Edition, sonst not_found.
create or replace function set_hackathon_info(p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; e event; v_sd date; v_ed_date date; v_st time; v_et time; v_changed text[] := '{}'; k text;
begin
  if not is_hack_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_ed := hack_edition(nullif(p_data->>'edition_id', '')::uuid);
  select * into e from event x where x.format_tag = 'hackathon' and x.edition_id = v_ed limit 1;
  if e.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_sd := case when p_data ? 'start_date' then nullif(p_data->>'start_date', '')::date else e.start_date end;
  v_ed_date := case when p_data ? 'end_date' then nullif(p_data->>'end_date', '')::date else e.end_date end;
  v_st := case when p_data ? 'start_time' then nullif(p_data->>'start_time', '')::time else e.start_time end;
  v_et := case when p_data ? 'end_time' then nullif(p_data->>'end_time', '')::time else e.end_time end;
  -- Ende nicht vor dem Beginn: Datum allein, und mit beiden Uhrzeiten auch die Zeit.
  if v_sd is not null and v_ed_date is not null
     and (v_ed_date, coalesce(v_et, time '23:59:59')) < (v_sd, coalesce(v_st, time '00:00')) then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  if length(coalesce(p_data->>'schedule_note_de', '')) > 200 or length(coalesce(p_data->>'schedule_note_en', '')) > 200 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;
  update event set
    start_date = v_sd, end_date = v_ed_date, start_time = v_st, end_time = v_et,
    schedule_note_de = case when p_data ? 'schedule_note_de' then nullif(btrim(p_data->>'schedule_note_de'), '') else schedule_note_de end,
    schedule_note_en = case when p_data ? 'schedule_note_en' then nullif(btrim(p_data->>'schedule_note_en'), '') else schedule_note_en end,
    venue = case when p_data ? 'venue' then nullif(btrim(p_data->>'venue'), '') else venue end,
    location = case when p_data ? 'location' then nullif(btrim(p_data->>'location'), '') else location end,
    updated_at = now()
   where id = e.id;
  foreach k in array array['start_date', 'end_date', 'start_time', 'end_time', 'schedule_note_de', 'schedule_note_en', 'venue', 'location'] loop
    if p_data ? k then v_changed := array_append(v_changed, k); end if;
  end loop;
  perform log_audit('hack.info_set', 'event', e.id::text, null, jsonb_build_object('fields', to_jsonb(v_changed)));
end $$;

-- ---------------------------------------------------------------- 2 · Ansprechperson des Hackathons

insert into vocab_term (vocabulary, key, label_de, label_en, sort_order, active)
select 'edition_contact_type', 'hackathon_lead', 'Hackathon-Ansprechperson', 'Hackathon contact', 6, true
where not exists (select 1 from vocab_term t where t.vocabulary = 'edition_contact_type' and t.key = 'hackathon_lead');

alter table edition_contact drop constraint if exists edition_contact_type_chk;
alter table edition_contact add constraint edition_contact_type_chk
  check (type in ('partner_lead', 'partner_buddy', 'speaker_lead', 'speaker_buddy', 'tour_lead', 'hackathon_lead'));

-- Live-Fassung aus supabase/snapshot/functions/upsert_edition_contact.sql; einzige Änderung: Typliste.
create or replace function upsert_edition_contact(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_id uuid; v_ed uuid; v_typ text; v_mail text; v_consent date; v_mail_effektiv text;
        v_typ_alt text; v_typ_wirksam text;
begin
  v_id := nullif(p_data->>'id', '')::uuid;
  v_typ := nullif(btrim(p_data->>'type'), '');
  if v_typ is not null and v_typ not in ('partner_lead','partner_buddy','speaker_lead','speaker_buddy','tour_lead','hackathon_lead') then
    raise exception 'invalid_contact_type' using errcode = '22023', detail = coalesce(v_typ, 'null');
  end if;
  -- ADM-059: Wer nur den Abschnitt „Company Tours" hat, darf **Begleitungen**
  -- pflegen und sonst nichts. Die Regeln dafuer (Pflichtfelder, Einwilligung bei
  -- fremder Adresse, Standard-Eindeutigkeit) stehen genau einmal — hier —, statt
  -- in einer zweiten Funktion daneben, wo sie auseinanderlaufen wuerden.
  --
  -- Der **wirksame** Typ zaehlt: beim Aendern der bestehende, wenn keiner
  -- mitkommt. Und der bisherige muss ebenfalls `tour_lead` sein — sonst koennte
  -- jemand eine Begleitung anlegen und sie danach in einen Speaker-Buddy
  -- verwandeln, also ueber den Umweg genau das pflegen, was ihm verwehrt ist.
  if v_id is not null then
    select c.type into v_typ_alt from edition_contact c where c.id = v_id;
  end if;
  v_typ_wirksam := coalesce(v_typ, v_typ_alt);
  if not can_edit_edition_contacts() then
    if not (coalesce(has_admin_section('companyTours'), false)
            and v_typ_wirksam = 'tour_lead'
            and (v_id is null or v_typ_alt = 'tour_lead')) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  v_mail := nullif(btrim(p_data->>'email'), '');
  v_consent := nullif(p_data->>'contract_consent_at', '')::date;

  -- Welche Adresse gilt am Ende, und welches Datum? Beim Ändern zählt der
  -- bestehende Stand, wenn das Feld nicht mitgeschickt wird — sonst würde eine
  -- reine Namenskorrektur an der Einwilligung scheitern.
  if v_id is not null then
    select coalesce(v_mail, c.email::text),
           case when p_data ? 'contract_consent_at' then v_consent else c.contract_consent_at end
      into v_mail_effektiv, v_consent
      from edition_contact c where c.id = v_id;
  else
    v_mail_effektiv := v_mail;
  end if;

  if v_mail_effektiv is not null
     and lower(v_mail_effektiv) not like '%@chef-treff.de'
     and v_consent is null then
    raise exception 'contact_consent_required' using errcode = '22023', detail = v_mail_effektiv;
  end if;

  select coalesce(nullif(p_data->>'edition_id','')::uuid,
                  (select e.id from event e where e.is_edition order by e.start_date desc limit 1))
    into v_ed;

  -- **Erst umhängen, dann schreiben.** Der Teilindex `edition_contact_default_uidx`
  -- duldet keinen zweiten Standard je Edition und Typ — auch nicht für die
  -- Dauer einer Anweisung.
  if coalesce((p_data->>'is_default')::boolean, false) then
    update edition_contact set is_default = false, updated_at = now()
     where edition_id = v_ed
       and type = coalesce(v_typ, (select c.type from edition_contact c where c.id = v_id))
       and is_default
       and (v_id is null or id <> v_id);
  end if;

  if v_id is null then
    if v_typ is null or nullif(btrim(p_data->>'display_name'), '') is null
       or v_mail is null or nullif(btrim(p_data->>'phone'), '') is null then
      raise exception 'fields_required' using errcode = '22023',
        detail = 'type, display_name, email und phone sind Pflicht';
    end if;
    insert into edition_contact (edition_id, type, display_name, role_label_de, role_label_en,
                                 email, phone, photo_path, is_default, sort_order, contract_consent_at)
    values (v_ed, v_typ, btrim(p_data->>'display_name'),
            nullif(btrim(p_data->>'role_label_de'), ''), nullif(btrim(p_data->>'role_label_en'), ''),
            v_mail::citext, btrim(p_data->>'phone'),
            nullif(btrim(p_data->>'photo_path'), ''),
            coalesce((p_data->>'is_default')::boolean, false),
            coalesce((p_data->>'sort_order')::integer, 0), v_consent)
    returning id into v_id;
  else
    update edition_contact set
      type          = coalesce(v_typ, type),
      display_name  = coalesce(nullif(btrim(p_data->>'display_name'), ''), display_name),
      role_label_de = case when p_data ? 'role_label_de' then nullif(btrim(p_data->>'role_label_de'), '') else role_label_de end,
      role_label_en = case when p_data ? 'role_label_en' then nullif(btrim(p_data->>'role_label_en'), '') else role_label_en end,
      email         = coalesce(v_mail::citext, email),
      phone         = coalesce(nullif(btrim(p_data->>'phone'), ''), phone),
      photo_path    = case when p_data ? 'photo_path' then nullif(btrim(p_data->>'photo_path'), '') else photo_path end,
      is_default    = coalesce((p_data->>'is_default')::boolean, is_default),
      sort_order    = coalesce((p_data->>'sort_order')::integer, sort_order),
      contract_consent_at = case when p_data ? 'contract_consent_at' then v_consent else contract_consent_at end,
      updated_at    = now()
     where id = v_id;
    if not found then raise exception 'contact_not_found' using errcode = 'P0002', detail = v_id::text; end if;
  end if;

  perform log_audit('edition_contact.upsert', 'edition_contact', v_id::text, null, p_data - 'photo_path');
  return v_id;
end $$;

-- ---------------------------------------------------------------- 3 · Eckdaten, Kontakt und Zähler für die Startseite

create or replace function hack_event_info(p_edition_id uuid default null, p_language text default 'en')
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_ed uuid; e event; c edition_contact; v_acc integer; v_teams integer; v_de boolean := coalesce(p_language, 'en') = 'de';
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  v_ed := hack_edition(p_edition_id);
  -- Dasselbe Gate wie das Portal (requireArea hackathon): Teilnehmende, Partner, Bereichsleitung, Hack-Team.
  -- Der Kontakt gehört in die bestehende Beziehung, nie in eine Liste für alle Angemeldeten.
  if not (has_role('hackathon_participant') or has_role('hackathon_partner') or has_role('area_lead_hackathon') or is_hack_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into e from event x where x.format_tag = 'hackathon' and x.edition_id = v_ed limit 1;
  if e.id is null then return null; end if;
  select * into c from edition_contact k where k.edition_id = v_ed and k.type = 'hackathon_lead'
   order by k.is_default desc, k.sort_order, k.created_at limit 1;
  select count(*)::integer into v_acc from hack_application a where a.edition_id = v_ed and a.status = 'accepted';
  select count(*)::integer into v_teams from hack_team t where t.edition_id = v_ed;
  return jsonb_build_object(
    'start_date', e.start_date, 'end_date', e.end_date, 'start_time', e.start_time, 'end_time', e.end_time,
    'starts_at', case when e.start_date is not null and e.start_time is not null then (e.start_date + e.start_time) at time zone e.timezone end,
    'ends_at', case when e.end_date is not null and e.end_time is not null then (e.end_date + e.end_time) at time zone e.timezone end,
    'timezone', e.timezone, 'venue', e.venue, 'location', e.location,
    'note', case when v_de then coalesce(e.schedule_note_de, e.schedule_note_en) else coalesce(e.schedule_note_en, e.schedule_note_de) end,
    'contact', case when c.id is null then null else jsonb_build_object(
      'name', c.display_name,
      'role', case when v_de then coalesce(c.role_label_de, c.role_label_en) else coalesce(c.role_label_en, c.role_label_de) end,
      'email', c.email::text, 'phone', c.phone, 'photo_path', c.photo_path) end,
    -- Zahlen erst ab 20 angenommenen Bewerbungen (K-59): darunter wirkt die Zahl dünn und verrät fast Einzelne.
    'accepted', case when v_acc >= 20 then v_acc else null end,
    'teams', case when v_acc >= 20 then v_teams else null end);
end $$;

select harden_definer_functions();
