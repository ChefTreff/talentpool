-- Vorschlag ohne Nummer · Welle 6 · Eine Sprache je Session: „Gemischt“ fällt weg (SPK-052)
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Anlass: Konrad am 24.09. (Sichtprüfung `/speaker/session`): „Gemischt raus —
-- wir entscheiden uns für eine Sprache“. Entschieden über die Architektur-Session
-- am 24.09.: der Wert fällt **überall** weg — Constraint, Vokabular, RPCs, Board,
-- Partner-Portal und Teilnehmer-Filter (Oberfläche im selben PR).
--
-- Reihenfolge ist Pflicht: erst der Bestand, dann das Constraint. Zwei
-- DEMO-Sessions (fls27, „DEMO Opening“, „DEMO Get-together“) stehen auf `mixed`;
-- ohne das `update` davor scheiterte `add constraint` an ihnen (23514). Beide
-- sind veröffentlicht und haben einen Slot — der Veröffentlichungs-Trigger lässt
-- die Änderung durch; ausser `updated_at` und der Board-Meldung löst sie nichts
-- aus (kein Swapcard-Cron auf `session`).
--
-- Funktionen aus `supabase/snapshot/functions/`: `submit_session_content` und
-- `partner_update_session` (dort zusätzlich `language: null` → 22023
-- `invalid_language` statt 23502). `partner_create_session` setzt fest `de`,
-- `upsert_session` und `approve_session_content` verlassen sich auf das
-- Constraint — keine Änderung nötig.
--
-- Fehlerschlüssel: unverändert 22023 `invalid_language`.

set search_path = public, extensions;

-- ---- 1 · Bestand (vor dem Constraint)
update session set language = 'de' where language = 'mixed';
update session_submission set language = 'de' where language = 'mixed';

-- ---- 2 · Constraint
alter table session drop constraint if exists session_language_check;
alter table session add constraint session_language_check check (language in ('de', 'en'));

-- ---- 3 · Vokabular: stilllegen, nicht löschen (alte Einträge behalten ihr Label)
update vocab_term set active = false where vocabulary = 'language' and key = 'mixed' and active;

-- ---- 4 · submit_session_content
create or replace function submit_session_content(p_session_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_sp uuid; v_id uuid;
  v_lang text := nullif(p_data->>'language', '');
  v_topics text[];
  v_topic text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not is_speaker_side_of(p_session_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Eine Sprache je Session (SPK-052): „Gemischt“ gibt es nicht mehr.
  if v_lang is not null and v_lang not in ('de', 'en') then raise exception 'invalid_language' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_data->>'title', '')), '') is null then raise exception 'title_required' using errcode = '22023'; end if;

  v_topics := coalesce(
    (select array_agg(x) from jsonb_array_elements_text(coalesce(p_data->'topics', '[]'::jsonb)) x), '{}');

  -- Jedes Thema muss im Vokabular stehen (SPK-027). Ohne diese Schleife
  -- bliebe `topics` ein Freitextfeld mit Auswahlknöpfen davor: die Oberfläche
  -- böte eine Liste an, die Datenbank nähme trotzdem alles entgegen.
  foreach v_topic in array v_topics loop
    if not is_vocab_key('session_topic', v_topic) then
      raise exception 'invalid_topic' using errcode = '22023', detail = v_topic;
    end if;
  end loop;

  select sp.id into v_sp
    from speaker_profile sp
    join session_speaker ss on ss.person_id = sp.person_id and ss.session_id = p_session_id
    join session se on se.id = p_session_id
    join event e on e.id = se.event_id and (e.edition_id = sp.edition_id or e.id = sp.edition_id)
   where sp.person_id = v_me or is_speaker_assistant(sp.id, v_me)
   order by (sp.person_id = v_me) desc limit 1;
  update session_submission set status = 'superseded' where session_id = p_session_id and status = 'submitted';
  insert into session_submission (session_id, speaker_profile_id, submitted_by, title, description, topics, language, notes)
  values (p_session_id, v_sp, v_me, btrim(p_data->>'title'), nullif(btrim(p_data->>'description'), ''),
          v_topics, v_lang, nullif(btrim(p_data->>'notes'), ''))
  returning id into v_id;
  perform log_audit('session.submission', 'session', p_session_id::text, null, jsonb_build_object('submission_id', v_id, 'speaker_profile_id', v_sp));
  return v_id;
end $$;

-- ---- 5 · partner_update_session
create or replace function partner_update_session(p_session_id uuid, p_fields jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_se session; v_org uuid; v_details jsonb; v_bad text; v_zurueck boolean := false;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_se from session where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  v_org := v_se.partner_org_id;
  if v_org is null or not partner_can_edit(v_org) then raise exception 'not allowed' using errcode = '42501'; end if;

  select string_agg(k, ',') into v_bad from jsonb_object_keys(p_fields) k
   where k not in ('title_de','title_en','description_de','description_en','language','format_details');
  if v_bad is not null then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_bad;
  end if;
  -- Eine Sprache je Session (SPK-052). `coalesce`, weil `NULL not in (…)` NULL
  -- ist und das `if` durchliesse — `{"language": null}` schrieb sonst NULL in eine
  -- Pflichtspalte und endete in 23502 statt in einer Meldung (Lehre aus 0118).
  if p_fields ? 'language' and coalesce((p_fields->>'language') not in ('de','en'), true) then
    -- `detail` darf nicht NULL sein (22004) — gerade beim Wert NULL, um den es hier geht.
    raise exception 'invalid_language' using errcode = '22023', detail = coalesce(p_fields->>'language', 'null');
  end if;

  v_details := case when p_fields ? 'format_details'
                    -- Auflage 6: die Organisation mitgeben, sonst prüft die Funktion nur die Form.
                    then check_format_details(v_se.format, p_fields->'format_details', v_org)
                    else v_se.format_details end;

  -- Auflage 4: Nur die Felder, die im veröffentlichten Programm stehen, lösen eine erneute
  -- Freigabe aus — und nur, wenn sie sich wirklich ändern. Wer denselben Titel noch einmal
  -- speichert, soll nicht aus dem Programm fallen.
  v_zurueck := v_se.publish_status = 'published' and (
       (p_fields ? 'title_de'       and nullif(btrim(p_fields->>'title_de'), '')       is distinct from v_se.title_de)
    or (p_fields ? 'title_en'       and nullif(btrim(p_fields->>'title_en'), '')       is distinct from v_se.title_en)
    or (p_fields ? 'description_de' and nullif(btrim(p_fields->>'description_de'), '') is distinct from v_se.description_de)
    or (p_fields ? 'description_en' and nullif(btrim(p_fields->>'description_en'), '') is distinct from v_se.description_en)
    or (p_fields ? 'language'       and (p_fields->>'language')                        is distinct from v_se.language));

  update session set
    title_de = case when p_fields ? 'title_de' then nullif(btrim(p_fields->>'title_de'), '') else title_de end,
    title_en = case when p_fields ? 'title_en' then nullif(btrim(p_fields->>'title_en'), '') else title_en end,
    description_de = case when p_fields ? 'description_de' then nullif(btrim(p_fields->>'description_de'), '') else description_de end,
    description_en = case when p_fields ? 'description_en' then nullif(btrim(p_fields->>'description_en'), '') else description_en end,
    language = case when p_fields ? 'language' then p_fields->>'language' else language end,
    format_details = v_details,
    publish_status = case when v_zurueck then 'review' else publish_status end,
    updated_by = current_person_id()
  where id = p_session_id;

  if v_zurueck and v_se.slot_id is not null then
    -- Der Slot zieht mit, wie bei der Ablehnung in `release_partner_session`: die Zeit bleibt
    -- reserviert, gilt aber nicht mehr als zugesagt.
    update slot set status = 'requested' where id = v_se.slot_id and status = 'final';
  end if;

  perform log_audit('partner.session_update', 'session', p_session_id::text,
                    jsonb_build_object('format_details', v_se.format_details,
                                       'publish_status', v_se.publish_status),
                    jsonb_build_object('fields', (select array_agg(k) from jsonb_object_keys(p_fields) k),
                                       'back_to_review', v_zurueck));
  return v_zurueck;
end $$;

select harden_definer_functions();
