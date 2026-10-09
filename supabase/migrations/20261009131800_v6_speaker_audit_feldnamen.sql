-- 0301 · Audit der Assistenz-Änderung nur mit Feldnamen (SPK-094)
-- Angewendet von der Architektur-Session am 09.10.2026 als 20261009131800.
-- Nummer und Zeitstempel vergibt die Architektur-Session beim Anwenden.
--
-- Anlass: Befund aus #452 (SPK-093), Plan 09.10.2026: `update_my_speaker_profile` schreibt bei einer Änderung durch die **Assistenz** den ganzen Eingabeblock
-- `p_data - 'id'` ins Audit (`speaker.assistant_update`) — dort stehen Telefonnummer, Namen und LinkedIn-Adresse im Klartext. Regel (wie „Audit ohne
-- Klartext-E-Mail“, #297): ins Audit nur die **Namen der geänderten Felder** und die `person_id`, keine Werte.
--
-- Was die Migration tut (eine bestehende Funktion, aus dem Snapshot nach 0300; keine Tabelle, keine Spalte, keine neue Funktion)
--   1  `update_my_speaker_profile`: vor dem Schreiben liest die Funktion — nur für die Assistenz — den Stand der Person; nach dem Schreiben vergleicht sie je Feld
--      den Eingabewert (so, wie er geschrieben wird: getrimmt, leer ⇒ null; Sprache nur `de`/`en`; Links und Technik nur als Objekt) mit dem Stand davor und sammelt die
--      Namen der **geänderten** Felder (sortiert). Das Protokoll bekommt `after = {"felder": [...], "person_id": <die Speakerin>}`, `before` bleibt leer. Gespeichert wird
--      ohne Änderung nichts ⇒ **kein Eintrag** (vorher: ein Eintrag je Aufruf, auch ohne Änderung). Die Namen sind die der Eingabe (`first_name`, `phone`, `bio_short_en`,
--      `socials`, `contact_email` …), nie ein Wert.
--   2  Schreibt die Speakerin selbst, entsteht wie bisher kein Eintrag. Rechte, Fehlerschlüssel und alles, was die Funktion sonst tut, bleiben (der Test hält es fest).
--   3  **Bestandseinträge bleiben, wie sie sind** — die Migration schreibt nicht an `audit_log`.
--
-- Rechte und Fehlerschlüssel: unverändert (die Person selbst oder ihre Assistenz; 28000 · P0002 `speaker_not_found` · 22023 `invalid_contact_kind`,
-- `speaker_contact_consent_required`). Das Audit-Aktionswort `speaker.assistant_update` bleibt.
set search_path = public, extensions;

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
  v_alt_p person%rowtype; v_felder text[];
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

  -- SPK-094: Aendert die Assistenz das Profil einer anderen Person, nennt das Protokoll nur, WELCHE Felder sich geaendert haben - nie ihre Werte
  -- (Telefonnummer, Namen und Adressen stuenden sonst im Klartext im Audit). Dafuer der Stand der Person vor dem Schreiben.
  if v_sp.person_id <> v_me then
    select * into v_alt_p from person where id = v_sp.person_id;
  end if;

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

  -- SPK-094: nur die Namen der geaenderten Felder (sortiert) und die Person, nie ein Wert. Eine Speicherung ohne Aenderung hinterlaesst keinen Eintrag.
  if v_sp.person_id <> v_me then
    v_felder := array(
      select f.name
        from (values
          ('first_name',         p_data ? 'first_name'         and nullif(btrim(p_data->>'first_name'), '')         is distinct from v_alt_p.first_name),
          ('last_name',          p_data ? 'last_name'          and nullif(btrim(p_data->>'last_name'), '')          is distinct from v_alt_p.last_name),
          ('title',              p_data ? 'title'              and nullif(btrim(p_data->>'title'), '')              is distinct from v_alt_p.title),
          ('linkedin_url',       p_data ? 'linkedin_url'       and nullif(btrim(p_data->>'linkedin_url'), '')       is distinct from v_alt_p.linkedin_url),
          ('phone',              v_tel_gegeben                 and v_tel                                            is distinct from v_alt_p.phone),
          ('preferred_language', p_data ? 'preferred_language' and p_data->>'preferred_language' in ('de', 'en')    and p_data->>'preferred_language' is distinct from v_alt_p.preferred_language),
          ('job_title',          p_data ? 'job_title'          and nullif(btrim(p_data->>'job_title'), '')          is distinct from v_sp.job_title),
          ('organization_name',  p_data ? 'organization_name'  and nullif(btrim(p_data->>'organization_name'), '')  is distinct from v_sp.organization_name),
          ('bio_short_en',       p_data ? 'bio_short_en'       and nullif(btrim(p_data->>'bio_short_en'), '')       is distinct from v_sp.bio_short_en),
          ('bio_short_de',       p_data ? 'bio_short_de'       and nullif(btrim(p_data->>'bio_short_de'), '')       is distinct from v_sp.bio_short_de),
          ('bio_long_en',        p_data ? 'bio_long_en'        and nullif(btrim(p_data->>'bio_long_en'), '')        is distinct from v_sp.bio_long_en),
          ('bio_long_de',        p_data ? 'bio_long_de'        and nullif(btrim(p_data->>'bio_long_de'), '')        is distinct from v_sp.bio_long_de),
          ('socials',            p_data ? 'socials'    and jsonb_typeof(p_data->'socials') = 'object'    and p_data->'socials'    is distinct from v_sp.socials),
          ('tech_rider',         p_data ? 'tech_rider' and jsonb_typeof(p_data->'tech_rider') = 'object' and p_data->'tech_rider' is distinct from v_sp.tech_rider),
          ('contact_first_name', v_kontakt_vor                 is distinct from v_sp.contact_first_name),
          ('contact_last_name',  v_kontakt_nach                is distinct from v_sp.contact_last_name),
          ('contact_email',      v_kontakt_mail::citext        is distinct from v_sp.contact_email),
          ('contact_phone',      v_kontakt_tel                 is distinct from v_sp.contact_phone),
          ('contact_kind',       v_kontakt_art                 is distinct from v_sp.contact_kind),
          ('contact_consent_at', v_kontakt_ok                  is distinct from v_sp.contact_consent_at)
        ) as f(name, geaendert)
       where f.geaendert
       order by f.name
    );
    if cardinality(v_felder) > 0 then
      perform log_audit('speaker.assistant_update', 'speaker_profile', v_sp.id::text, null,
                        jsonb_build_object('felder', to_jsonb(v_felder), 'person_id', v_sp.person_id));
    end if;
  end if;
  return v_sp.id;
end $$;

select harden_definer_functions();
