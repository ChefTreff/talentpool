-- 0300 · Speaker-Formular schreibt das Telefon als Eingabe (phone), E.164 leitet der Trigger ab (SPK-093)
-- Angewendet von der Architektur-Session am 09.10.2026 als 20261009124634.
-- Nummer und Zeitstempel vergibt die Architektur-Session beim Anwenden.
--
-- Anlass: SPK-093 (Plan 09.10.2026, Folgepunkt aus 0292/ADM-108). Seit 0292 leitet der BEFORE-Trigger `trg_person_contact_keys` die Spalte
-- `phone_e164` aus `phone` ab. Für das Speaker-Formular gilt dort eine Ausnahme: es schreibt `phone_e164` direkt, und ein unlesbarer Wert bleibt, wie er
-- kam (sonst ginge die Eingabe verloren). Mit dieser Migration schreibt das Formular `phone` — freie Eingabe, ohne Formatzwang — und `phone_e164` entsteht
-- nur noch über den Trigger.
--
-- **Abweichung vom Auftrag („klein, ohne Migration“):** `update_my_speaker_profile` kennt nur den Schlüssel `phone_e164`; ohne eine Änderung der Funktion
-- kann das Formular `phone` nicht schreiben. Zwei bestehende Funktionen, keine Tabelle, keine Spalte, keine neue Funktion.
--
-- Was die Migration tut
--   1  `update_my_speaker_profile` (aus dem Snapshot nach 0299; geändert ist nur das Telefon): der Schlüssel `phone` schreibt `person.phone` (getrimmt, leer ⇒ null);
--      `phone_e164` schreibt die Funktion nicht mehr direkt, der Trigger leitet ab (lesbar ⇒ E.164, unlesbar ⇒ null, die Eingabe bleibt in `phone`). Leert die Person
--      die Nummer (Schlüssel da, Wert leer), geht auch ein Altwert in `phone_e164` mit — sonst bliebe er stehen und käme beim nächsten Laden wieder. Der Schlüssel
--      `phone_e164` der Formulare vor SPK-093 gilt als dieselbe freie Eingabe (`phone` gewinnt, wenn beide kommen): wer das alte Formular noch offen hat, verliert
--      nichts, auch wenn die Migration vor der Auslieferung des neuen Formulars läuft. Ohne beide Schlüssel bleibt die Nummer unberührt.
--   2  `my_speaker_profile` (aus dem Snapshot nach 0299; additiv): `person.phone` — die Nummer, wie die Person sie eingegeben hat, bei Altbeständen (nur `phone_e164`
--      gefüllt) deren Wert, damit das Formular nichts leer zeigt, was gespeichert ist. `phone_e164` bleibt im JSON, solange ein Formular vor SPK-093 es liest.
--
-- Wirkung: der Admin sieht die Nummer eines Speakers jetzt unter /admin/personen/<Person> (Stammdaten, Feld Telefon) — bisher stand sie dort leer, weil das
-- Speaker-Formular nur `phone_e164` schrieb. Die Dubletten-Suche (`duplicate_scan`) vergleicht weiter `phone_e164`, jetzt ohne unlesbare Rohwerte.
--
-- Rechte und Fehlerschlüssel: unverändert (die Person selbst oder ihre Assistenz; 28000 · P0002 `speaker_not_found` · 22023 `invalid_contact_kind`,
-- `speaker_contact_consent_required`). Das Audit der Assistenz-Änderung (`speaker.assistant_update`) bleibt, wie es war.
set search_path = public, extensions;

create or replace function my_speaker_profile(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_p person%rowtype;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- SPK-071: das Profil, das die Person im Portal gewählt hat (sonst wie bisher).
  select * into v_sp from speaker_profile sp where sp.id = my_speaker_profile_id(p_edition_id);
  if not found then return null; end if;
  select * into v_p from person where id = v_sp.person_id;
  return jsonb_build_object(
    -- Kontakt ohne Portalzugang (0127): Agentur oder Office, das die
    -- Speakerin angeschrieben haben moechte. Steht am Profil, nicht als
    -- eigene Person — sonst waechst die Personentabelle um Karteileichen.
    'contact', case when v_sp.contact_first_name is null and v_sp.contact_last_name is null
                     and v_sp.contact_email is null and v_sp.contact_phone is null
                    then null
                    else jsonb_build_object(
                      'first_name', v_sp.contact_first_name, 'last_name', v_sp.contact_last_name,
                      'email', v_sp.contact_email, 'phone', v_sp.contact_phone,
                      'kind', v_sp.contact_kind, 'consent_at', v_sp.contact_consent_at) end,
    'id', v_sp.id, 'edition_id', v_sp.edition_id, 'is_assistant', (v_sp.person_id <> v_me),
    'edition_name', (select e.name from event e where e.id = v_sp.edition_id),
    'speaker_type', v_sp.speaker_type, 'pipeline_status', v_sp.pipeline_status,
    'job_title', v_sp.job_title, 'organization_name', v_sp.organization_name,
    'bio_short_en', v_sp.bio_short_en, 'bio_short_de', v_sp.bio_short_de,
    'bio_long_en', v_sp.bio_long_en, 'bio_long_de', v_sp.bio_long_de,
    'socials', v_sp.socials, 'tech_rider', v_sp.tech_rider,
    'reception_eligible', v_sp.reception_eligible, 'lounge_access', v_sp.lounge_access,
    'pass_type', v_sp.pass_type, 'hotel_tier', v_sp.hotel_tier, 'hospitality_status', v_sp.hospitality_status,
    'travel_costs_covered', v_sp.travel_costs_covered, 'travel_costs_approved', (v_sp.travel_costs_approved_at is not null),
    'invited_at', v_sp.invited_at,
    'contacts', (select coalesce(jsonb_agg(jsonb_build_object(
                            'id', c.id, 'kind', c.kind, 'first_name', c.first_name,
                            'last_name', c.last_name, 'email', c.email, 'phone', c.phone,
                            'has_access', c.has_access, 'consent_at', c.consent_at)
                          order by c.kind, c.created_at), '[]'::jsonb)
                   from speaker_contact c where c.profile_id = v_sp.id),
    'assistant', case when v_sp.assistant_person_id is null then null else (
       select jsonb_build_object('person_id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                                 'email', (select pe.email::text from person_email pe where pe.person_id = a.id and pe.is_primary))
       from person a where a.id = v_sp.assistant_person_id) end,
    'person', jsonb_build_object(
       'id', v_p.id, 'first_name', v_p.first_name, 'last_name', v_p.last_name, 'title', v_p.title,
       'linkedin_url', v_p.linkedin_url,
       'preferred_language', v_p.preferred_language,
       -- SPK-093: `phone` ist die Nummer, wie die Person sie eingegeben hat - bei Altbestaenden, in denen nur `phone_e164` steht, deren Wert.
       -- `phone_e164` bleibt im JSON, solange ein Formular vor SPK-093 es liest.
       'phone', coalesce(v_p.phone, v_p.phone_e164), 'phone_e164', v_p.phone_e164,
       'email', (select pe.email::text from person_email pe where pe.person_id = v_p.id and pe.is_primary)),
    'photo_asset_id', v_sp.photo_asset_id,
    'consents', (select coalesce(jsonb_object_agg(c.consent_type, c.granted), '{}'::jsonb) from consent_current c
                 where c.person_id = v_p.id and c.consent_type in ('photo_video', 'speaker_release', 'slides_publication', 'hospitality_data')),
    'next_steps', speaker_next_steps(v_sp.id)
  );
end $$;

create or replace function update_my_speaker_profile(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_sp speaker_profile%rowtype;
  v_id uuid := nullif(p_data->>'id', '')::uuid;
  v_kontakt_vor text; v_kontakt_nach text; v_kontakt_mail text;
  v_kontakt_tel text; v_kontakt_art text; v_kontakt_ok date; v_hat_kontakt boolean;
  v_tel_gegeben boolean; v_tel text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- SPK-071: ohne `id` das gewählte Profil (sonst wie bisher).
  select * into v_sp from speaker_profile sp
   where sp.id = coalesce(v_id, my_speaker_profile_id())
     and (sp.person_id = v_me or is_speaker_assistant(sp.id, v_me))
   for update;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  -- Kontakt ohne Portalzugang (0127). Die sechs Felder gehoeren zusammen:
  -- erst wird ausgerechnet, was nach dem Schreiben dastuende, dann geprueft.
  -- Sonst scheitert eine reine Namenskorrektur an der Einwilligung (dieselbe
  -- Lehre wie bei `upsert_edition_contact`, 0114).
  v_kontakt_vor  := nullif(btrim(coalesce(case when p_data ? 'contact_first_name' then p_data->>'contact_first_name' else v_sp.contact_first_name end, '')), '');
  v_kontakt_nach := nullif(btrim(coalesce(case when p_data ? 'contact_last_name'  then p_data->>'contact_last_name'  else v_sp.contact_last_name  end, '')), '');
  v_kontakt_mail := nullif(btrim(coalesce(case when p_data ? 'contact_email'      then p_data->>'contact_email'      else v_sp.contact_email::text end, '')), '');
  v_kontakt_tel  := nullif(btrim(coalesce(case when p_data ? 'contact_phone'      then p_data->>'contact_phone'      else v_sp.contact_phone      end, '')), '');
  v_kontakt_art  := nullif(btrim(coalesce(case when p_data ? 'contact_kind'       then p_data->>'contact_kind'       else v_sp.contact_kind       end, '')), '');
  v_kontakt_ok   := case when p_data ? 'contact_consent_at'
                         then nullif(btrim(p_data->>'contact_consent_at'), '')::date
                         else v_sp.contact_consent_at end;
  v_hat_kontakt  := coalesce(v_kontakt_vor, v_kontakt_nach, v_kontakt_mail, v_kontakt_tel) is not null;

  if v_kontakt_art is not null and not is_vocab_key('speaker_contact_kind', v_kontakt_art) then
    raise exception 'invalid_contact_kind' using errcode = '22023', detail = v_kontakt_art;
  end if;
  if v_hat_kontakt and v_kontakt_ok is null then
    -- Die Daten gehoeren einem Menschen, der hier kein Konto hat und nicht
    -- gefragt wurde. Ohne die Bestaetigung der Speakerin speichern wir sie
    -- nicht (Art. 6 DSGVO; eigener Schluessel, siehe Kopf).
    raise exception 'speaker_contact_consent_required' using errcode = '22023', detail = 'speaker_contact';
  end if;
  -- Wer alle Felder leert, nimmt den Kontakt zurueck — dann geht auch das
  -- Einwilligungsdatum, sonst bliebe ein Beleg ohne Gegenstand stehen.
  if not v_hat_kontakt then v_kontakt_ok := null; v_kontakt_art := null; end if;

  update speaker_profile set
    contact_first_name = v_kontakt_vor,
    contact_last_name  = v_kontakt_nach,
    contact_email      = v_kontakt_mail::citext,
    contact_phone      = v_kontakt_tel,
    contact_kind       = v_kontakt_art,
    contact_consent_at = v_kontakt_ok,
    job_title         = case when p_data ? 'job_title'         then nullif(btrim(p_data->>'job_title'), '')         else job_title end,
    organization_name = case when p_data ? 'organization_name' then nullif(btrim(p_data->>'organization_name'), '') else organization_name end,
    bio_short_en      = case when p_data ? 'bio_short_en'      then nullif(btrim(p_data->>'bio_short_en'), '')      else bio_short_en end,
    bio_short_de      = case when p_data ? 'bio_short_de'      then nullif(btrim(p_data->>'bio_short_de'), '')      else bio_short_de end,
    bio_long_en       = case when p_data ? 'bio_long_en'       then nullif(btrim(p_data->>'bio_long_en'), '')       else bio_long_en end,
    bio_long_de       = case when p_data ? 'bio_long_de'       then nullif(btrim(p_data->>'bio_long_de'), '')       else bio_long_de end,
    socials           = case when p_data ? 'socials'    and jsonb_typeof(p_data->'socials') = 'object'    then p_data->'socials'    else socials end,
    tech_rider        = case when p_data ? 'tech_rider' and jsonb_typeof(p_data->'tech_rider') = 'object' then p_data->'tech_rider' else tech_rider end
  where id = v_sp.id;

  -- SPK-093: Die Nummer ist freie Eingabe in `person.phone`; `phone_e164` leitet der Trigger `trg_person_contact_keys` daraus ab (0292): lesbar => E.164,
  -- unlesbar => null, die Eingabe bleibt in `phone`. Der Schluessel `phone_e164` der Formulare vor SPK-093 gilt als dieselbe freie Eingabe (`phone` gewinnt,
  -- wenn beide kommen); fehlen beide, bleibt die Nummer unberuehrt.
  v_tel_gegeben := p_data ? 'phone' or p_data ? 'phone_e164';
  v_tel := nullif(btrim(case when p_data ? 'phone' then p_data->>'phone' else p_data->>'phone_e164' end), '');

  update person set
    first_name         = case when p_data ? 'first_name'         then nullif(btrim(p_data->>'first_name'), '')         else first_name end,
    last_name          = case when p_data ? 'last_name'          then nullif(btrim(p_data->>'last_name'), '')          else last_name end,
    title              = case when p_data ? 'title'              then nullif(btrim(p_data->>'title'), '')              else title end,
    linkedin_url       = case when p_data ? 'linkedin_url'       then nullif(btrim(p_data->>'linkedin_url'), '')       else linkedin_url end,
    phone              = case when v_tel_gegeben then v_tel else phone end,
    -- Leert die Person die Nummer, geht auch ein Altwert in `phone_e164` mit - sonst bliebe er stehen und kaeme beim naechsten Laden wieder.
    phone_e164         = case when v_tel_gegeben and v_tel is null then null else phone_e164 end,
    preferred_language = case when p_data ? 'preferred_language' and p_data->>'preferred_language' in ('de', 'en') then p_data->>'preferred_language' else preferred_language end
  where id = v_sp.person_id;

  if v_sp.person_id <> v_me then
    perform log_audit('speaker.assistant_update', 'speaker_profile', v_sp.id::text, null, p_data - 'id');
  end if;
  return v_sp.id;
end $$;

select harden_definer_functions();
