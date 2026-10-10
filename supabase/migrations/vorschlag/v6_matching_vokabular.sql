-- 00NN · Matching Stufe 1 — Vokabular und Whitelists des Wunschprofils (K-94, QS-070)
-- Vorschlag des Partner-Chats, noch nicht angewendet. Nummer und Zeitstempel vergibt die Architektur-Session beim Anwenden.
--
-- Anlass: Konrad hat das Matching-Konzept (`docs/konzept-qs070-matching.md`) mit K-94 bestätigt („wie empfohlen“). Stufe 1 macht das Vokabular sauber: ein gemeinsamer Kern
-- aus Studienfeld, Skills, Fachbereich und Kategorie (`career_opportunities`) auf beiden Seiten. Plan 10.10.2026: Teil A (Partner-Seite) baut der Partner-Chat; Teil B
-- (`hack_skill` → `skill`, `function_area` am Teilnehmerprofil) gehört dem Talent-Chat und ist nicht Teil dieser Migration.
--
-- Was die Migration tut (drei bestehende Funktionen, ein interner Helfer — keine Tabelle, keine Spalte, kein neues Recht)
--   1  `check_format_details` (Interview Table, künftig Masterclass) und `partner_update_tour_stop` (Tour-Stopp): die Whitelist von `target_profile` ist jetzt
--      `occupation_status, study_field, skill, function_area, career_opportunities`. **`career_level` fällt heraus** (wird wie jeder unbekannte Schlüssel abgelehnt,
--      22023 `invalid_format_details`, `detail` = `target_profile.career_level`); `career_level` bleibt Vokabular und Selbstauskunft am Teilnehmerprofil. Die Werte
--      prüft weiter `is_vocab_key(<Schlüssel>, <Wert>)` — die Schlüssel heißen wie die Vokabulargruppen. **`nicht-interessiert` ist im Wunschprofil nicht erlaubt**
--      (22023 `invalid_vocab`, `detail` = `career_opportunities:nicht-interessiert`): „Ich bin aktuell nicht interessiert an Jobangeboten“ beschreibt eine Person,
--      nicht das, was ein Partner bietet; die Oberfläche blendet den Eintrag aus.
--   2  `format_detail_keys('masterclass')` trägt zusätzlich `target_profile` — Stufe 1 öffnet nur den Weg, die Maske für die Masterclass kommt mit PART-140 (Stufe 2).
--   3  Defensive Datenkorrektur: `matching_career_level_entfernen()` (intern, für anon und authenticated nicht ausführbar) nimmt `career_level` aus vorhandenen
--      `target_profile`-Objekten der Tour-Stopps und der `format_details` der Sessions; die Migration ruft sie **einmal** auf und bricht ab, wenn danach noch ein Objekt
--      den Schlüssel trägt. Live-Bestand (10.10.2026 gelesen): 21 Tour-Stopps mit `target_profile = {}` und keine Session mit `target_profile` — es ändert sich keine Zeile;
--      die Korrektur ist für Daten da, die es bis zum Anwenden geben könnte. Idempotent, kein Audit-Eintrag (Datenmigration ohne handelnde Person, wie 0294/0302).
--
-- Basis ist der Snapshot (db-konventionen §1): die drei Funktionen sind die Live-Fassung, geändert sind genau die Zeilen der Whitelist, der Regel zu `nicht-interessiert`
-- und der Eintrag der Masterclass. Rechte, Audit (`partner.tour_stop_update` mit Feldnamen) und Schreibwege bleiben.
-- Fehlerschlüssel: keine neuen (`invalid_format_details`, `invalid_vocab` gibt es schon).
set search_path = public, extensions;

create or replace function format_detail_keys(p_format text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select case p_format
    when 'side_event' then array['location_text', 'image_asset_id']
    when 'interview_table' then array['job_title', 'job_posting_text', 'job_posting_url',
                                      'target_profile', 'interview_mode']
    -- PART-054: ob der Partner Goodies einsendet — eine Angabe fürs Team, nicht fürs Programm.
    -- K-94 Stufe 1: auch die Masterclass trägt ein Wunschprofil (die Maske dazu kommt mit PART-140, Stufe 2).
    when 'masterclass' then array['goodies_planned', 'target_profile']
    -- `company_tour` fehlt mit Absicht: seit Konrads Entscheidung D5 (18.09.) hat sie ein
    -- eigenes Datenmodell mit Touren und Stopps; die Angaben des Partners gehören an seinen
    -- Stopp, nicht an die Session.
    else array[]::text[] end
$$;

-- ---------------------------------------------------------------------------
create or replace function check_format_details(p_format text, p_details jsonb, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_allowed text[] := format_detail_keys(p_format);
  v_out jsonb := '{}'::jsonb;
  k text; v_txt text; v_prof jsonb; v_key text; v_el text; v_asset uuid;
begin
  if p_details is null or p_details = '{}'::jsonb then return '{}'::jsonb; end if;
  if jsonb_typeof(p_details) <> 'object' then
    raise exception 'invalid_format_details' using errcode = '22023', detail = 'object_required';
  end if;

  for k in select jsonb_object_keys(p_details) loop
    if not (k = any(v_allowed)) then
      raise exception 'invalid_format_details' using errcode = '22023', detail = k;
    end if;
  end loop;

  -- Texte: trimmen, Längen prüfen. Leerer Text heißt „nicht gesetzt".
  for k, v_txt in
    select key, nullif(btrim(value #>> '{}'), '')
      from jsonb_each(p_details)
     where key in ('location_text','job_title','job_posting_text','job_posting_url')
  loop
    if v_txt is null then continue; end if;
    if k = 'location_text' and length(v_txt) > 200 then raise exception 'too_long' using errcode = '22023', detail = k; end if;
    if k = 'job_title' and length(v_txt) > 120 then raise exception 'too_long' using errcode = '22023', detail = k; end if;
    if k = 'job_posting_text' and length(v_txt) > 2000 then raise exception 'too_long' using errcode = '22023', detail = k; end if;
    if k = 'job_posting_url' and v_txt !~ '^https://' then
      raise exception 'invalid_url' using errcode = '22023', detail = k;
    end if;
    v_out := v_out || jsonb_build_object(k, v_txt);
  end loop;

  -- Einzel- oder Gruppengespräch (Konrad, D1): der Partner legt es je Tisch fest. Die
  -- Kapazität steht an der Session, hier nur die Art — sonst stünde „Gruppe" bei Kapazität 1.
  if p_details ? 'interview_mode' then
    if (p_details->>'interview_mode') not in ('single', 'group') then
      raise exception 'invalid_format_details' using errcode = '22023', detail = 'interview_mode';
    end if;
    v_out := v_out || jsonb_build_object('interview_mode', p_details->>'interview_mode');
  end if;

  -- Gesuchte Profile: dieselben Vokabulare wie im Teilnehmerprofil, damit die Auswahl auf beiden
  -- Seiten dasselbe bedeutet. Kein Freitext. K-94 (Matching, Stufe 1): Status, Studienfeld, Skills,
  -- Fachbereich und Kategorie (`career_opportunities`); `career_level` (Berufserfahrung) ist
  -- Selbstauskunft am Profil und zählt nicht fürs Matching.
  if p_details ? 'target_profile' then
    v_prof := p_details->'target_profile';
    if jsonb_typeof(v_prof) <> 'object' then
      raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile:object';
    end if;
    for v_key in select jsonb_object_keys(v_prof) loop
      if not (v_key = any(array['occupation_status','study_field','skill','function_area','career_opportunities'])) then
        raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile.' || v_key;
      end if;
      if jsonb_typeof(v_prof->v_key) <> 'array' then
        raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile.' || v_key || ':array';
      end if;
      for v_el in select jsonb_array_elements_text(v_prof->v_key) loop
        if not is_vocab_key(v_key, v_el) then
          raise exception 'invalid_vocab' using errcode = '22023', detail = v_key || ':' || v_el;
        end if;
        -- K-94: „Ich bin aktuell nicht interessiert an Jobangeboten“ beschreibt eine Person, nicht das, was ein Partner bietet.
        if v_key = 'career_opportunities' and v_el = 'nicht-interessiert' then
          raise exception 'invalid_vocab' using errcode = '22023', detail = v_key || ':' || v_el;
        end if;
      end loop;
    end loop;
    v_out := v_out || jsonb_build_object('target_profile', v_prof);
  end if;

  -- Goodies (PART-054, Konrad 22.09.): ja oder nein; `null` heißt „noch keine Angabe“ und
  -- fällt weg. Kein Text, keine Zahl — sonst stünde „vielleicht“ im Feld, das das Team nachhält.
  if p_details ? 'goodies_planned' then
    if jsonb_typeof(p_details->'goodies_planned') not in ('boolean', 'null') then
      raise exception 'invalid_format_details' using errcode = '22023', detail = 'goodies_planned';
    end if;
    if jsonb_typeof(p_details->'goodies_planned') = 'boolean' then
      v_out := v_out || jsonb_build_object('goodies_planned', (p_details->'goodies_planned')::boolean);
    end if;
  end if;

  -- Hintergrundbild: eine Datei **dieser** Organisation, sonst zeigte ein Programmpunkt auf
  -- den Upload eines fremden Partners.
  if p_details ? 'image_asset_id' then
    if nullif(btrim(p_details->>'image_asset_id'), '') is null then
      -- Leer heißt „Bild entfernen"; das bleibt erlaubt.
      null;
    else
      begin
        v_asset := (p_details->>'image_asset_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'invalid_format_details' using errcode = '22023', detail = 'image_asset_id:uuid';
      end;
      if p_org_id is not null and not exists (
           select 1 from partner_asset pa
             join org_edition oe on oe.id = pa.org_edition_id
            where pa.id = v_asset and oe.org_id = p_org_id) then
        raise exception 'invalid_format_details' using errcode = '22023', detail = 'image_asset_id:foreign';
      end if;
      v_out := v_out || jsonb_build_object('image_asset_id', v_asset);
    end if;
  end if;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
create or replace function partner_update_tour_stop(p_stop_id uuid, p_fields jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_st company_tour_stop; v_bad text; v_mail text; v_prof jsonb; v_key text; v_el text;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_st from company_tour_stop where id = p_stop_id;
  if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  if v_st.host_org_id is null or not partner_can_edit(v_st.host_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select string_agg(k, ',') into v_bad from jsonb_object_keys(p_fields) k
   where k not in ('address','contact_name','contact_email','contact_phone','time_note',
                   'snacks','notes_public','target_profile','photos_allowed');
  if v_bad is not null then
    raise exception 'not_editable' using errcode = 'P0001', detail = v_bad;
  end if;

  v_mail := nullif(btrim(coalesce(p_fields->>'contact_email', '')), '');
  if v_mail is not null and v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023', detail = 'contact_email';
  end if;
  if length(coalesce(p_fields->>'notes_public', '')) > 1000 then
    raise exception 'too_long' using errcode = '22023', detail = 'notes_public';
  end if;
  if length(coalesce(p_fields->>'address', '')) > 300 then
    raise exception 'too_long' using errcode = '22023', detail = 'address';
  end if;

  -- Gesuchte Profile gegen dieselben Vokabulare wie im Teilnehmerprofil (K-94: dieselbe Liste wie `check_format_details`).
  if p_fields ? 'target_profile' then
    v_prof := p_fields->'target_profile';
    if jsonb_typeof(v_prof) <> 'object' then
      raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile:object';
    end if;
    for v_key in select jsonb_object_keys(v_prof) loop
      if not (v_key = any(array['occupation_status','study_field','skill','function_area','career_opportunities'])) then
        raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile.' || v_key;
      end if;
      for v_el in select jsonb_array_elements_text(v_prof->v_key) loop
        if not is_vocab_key(v_key, v_el) then
          raise exception 'invalid_vocab' using errcode = '22023', detail = v_key || ':' || v_el;
        end if;
        -- K-94: „Ich bin aktuell nicht interessiert an Jobangeboten“ beschreibt eine Person, nicht das, was ein Partner bietet.
        if v_key = 'career_opportunities' and v_el = 'nicht-interessiert' then
          raise exception 'invalid_vocab' using errcode = '22023', detail = v_key || ':' || v_el;
        end if;
      end loop;
    end loop;
  end if;

  update company_tour_stop set
    address = case when p_fields ? 'address' then nullif(btrim(p_fields->>'address'), '') else address end,
    contact_name = case when p_fields ? 'contact_name' then nullif(btrim(p_fields->>'contact_name'), '') else contact_name end,
    contact_email = case when p_fields ? 'contact_email' then v_mail::citext else contact_email end,
    contact_phone = case when p_fields ? 'contact_phone' then nullif(btrim(p_fields->>'contact_phone'), '') else contact_phone end,
    time_note = case when p_fields ? 'time_note' then nullif(btrim(p_fields->>'time_note'), '') else time_note end,
    snacks = case when p_fields ? 'snacks' then (p_fields->>'snacks')::boolean else snacks end,
    notes_public = case when p_fields ? 'notes_public' then nullif(btrim(p_fields->>'notes_public'), '') else notes_public end,
    target_profile = case when p_fields ? 'target_profile' then p_fields->'target_profile' else target_profile end,
    photos_allowed = case when p_fields ? 'photos_allowed' then (p_fields->>'photos_allowed')::boolean else photos_allowed end,
    filled_at = now()
  where id = p_stop_id;

  perform log_audit('partner.tour_stop_update', 'company_tour_stop', p_stop_id::text, null,
                    jsonb_build_object('org_id', v_st.host_org_id,
                                       'fields', (select array_agg(k) from jsonb_object_keys(p_fields) k)));
end $$;

-- ---------------------------------------------------------------------------
-- Defensive Datenkorrektur (Punkt 3)
create or replace function matching_career_level_entfernen() returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $f$
declare v_stops integer; v_sessions integer;
begin
  update company_tour_stop set target_profile = target_profile - 'career_level'
   where jsonb_typeof(target_profile) = 'object' and target_profile ? 'career_level';
  get diagnostics v_stops = row_count;
  update session set format_details = jsonb_set(format_details, '{target_profile}', (format_details->'target_profile') - 'career_level')
   where jsonb_typeof(format_details->'target_profile') = 'object' and (format_details->'target_profile') ? 'career_level';
  get diagnostics v_sessions = row_count;
  return jsonb_build_object('stops', v_stops, 'sessions', v_sessions);
end $f$;

comment on function matching_career_level_entfernen() is
  'K-94 Stufe 1: nimmt career_level aus vorhandenen target_profile-Objekten (Tour-Stopps, format_details der Sessions). Idempotent, ohne Audit-Eintrag, intern.';

revoke execute on function matching_career_level_entfernen() from public, anon, authenticated;

do $mig$
declare
  v_n jsonb;
  v_rest integer;
begin
  v_n := matching_career_level_entfernen();
  select (select count(*) from company_tour_stop where jsonb_typeof(target_profile) = 'object' and target_profile ? 'career_level')
       + (select count(*) from session where jsonb_typeof(format_details->'target_profile') = 'object' and (format_details->'target_profile') ? 'career_level')
    into v_rest;
  if v_rest <> 0 then
    raise exception 'Korrektur unvollstaendig: % Wunschprofile tragen noch career_level', v_rest using errcode = 'P0001';
  end if;
  raise notice 'career_level aus Wunschprofilen entfernt: %', v_n;
end $mig$;

select harden_definer_functions();
