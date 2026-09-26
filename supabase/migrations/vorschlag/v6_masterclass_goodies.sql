-- Masterclass: Goodies einsenden ja/nein (PART-054)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: PART-054 (Konrad 22.09.) — „Goodies werden heute per Mail abgestimmt und dabei
-- vergessen“ → auf der Masterclass-Seite die Frage „Wollt ihr Goodies einsenden?“; bei Ja der Weg
-- zum Wiki-Artikel mit Versandadresse und Fristen (`anlieferung-aufbau`, vorhanden, geprüft 25.09.),
-- und der Haken steht beim Team, damit es nachhalten kann.
--
-- Die Masterclass hatte bisher keine eigenen Formatangaben (`format_detail_keys` gab eine leere
-- Liste). Diese Migration erlaubt den Schlüssel `goodies_planned`:
-- * `format_detail_keys('masterclass')` → `{goodies_planned}`;
-- * `check_format_details` nimmt nur `true`/`false`; `null` heißt „keine Angabe“ und fällt weg,
--   alles andere ist `invalid_format_details` (22023).
-- Geschrieben wird wie bei Side-Event und Interview Tables über `partner_update_session`
-- (`partner_can_edit`; das Partner-Team kommt darüber auch aus dem Admin). Eine Änderung an
-- `format_details` schickt eine veröffentlichte Session **nicht** zurück in die Freigabe — das tun
-- nur Titel, Beschreibung und Sprache. `programme_format_details` wählt seine Felder einzeln; die
-- Angabe erscheint also nicht im Programm.
--
-- Beide Funktionen aus dem Snapshot (Live-Fassung), nur um den Masterclass-Fall ergänzt.

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
    when 'masterclass' then array['goodies_planned']
    -- `company_tour` fehlt mit Absicht: seit Konrads Entscheidung D5 (18.09.) hat sie ein
    -- eigenes Datenmodell mit Touren und Stopps; die Angaben des Partners gehören an seinen
    -- Stopp, nicht an die Session.
    else array[]::text[] end
$$;

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

  -- Gesuchte Profile: dieselben Vokabular-Schlüssel wie im Teilnehmerprofil, damit die
  -- Auswahl auf beiden Seiten dasselbe bedeutet. Kein Freitext.
  if p_details ? 'target_profile' then
    v_prof := p_details->'target_profile';
    if jsonb_typeof(v_prof) <> 'object' then
      raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile:object';
    end if;
    for v_key in select jsonb_object_keys(v_prof) loop
      if not (v_key = any(array['occupation_status','career_level','study_field'])) then
        raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile.' || v_key;
      end if;
      if jsonb_typeof(v_prof->v_key) <> 'array' then
        raise exception 'invalid_format_details' using errcode = '22023', detail = 'target_profile.' || v_key || ':array';
      end if;
      for v_el in select jsonb_array_elements_text(v_prof->v_key) loop
        if not is_vocab_key(v_key, v_el) then
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

select harden_definer_functions();
