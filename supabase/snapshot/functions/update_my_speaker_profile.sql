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
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile sp
   where (v_id is null or sp.id = v_id) and (sp.person_id = v_me or sp.assistant_person_id = v_me)
   order by (sp.person_id = v_me) desc, sp.created_at desc limit 1 for update;
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

  update person set
    first_name         = case when p_data ? 'first_name'         then nullif(btrim(p_data->>'first_name'), '')         else first_name end,
    last_name          = case when p_data ? 'last_name'          then nullif(btrim(p_data->>'last_name'), '')          else last_name end,
    title              = case when p_data ? 'title'              then nullif(btrim(p_data->>'title'), '')              else title end,
    pronouns           = case when p_data ? 'pronouns'           then nullif(btrim(p_data->>'pronouns'), '')           else pronouns end,
    linkedin_url       = case when p_data ? 'linkedin_url'       then nullif(btrim(p_data->>'linkedin_url'), '')       else linkedin_url end,
    phone_e164         = case when p_data ? 'phone_e164'         then nullif(btrim(p_data->>'phone_e164'), '')         else phone_e164 end,
    preferred_language = case when p_data ? 'preferred_language' and p_data->>'preferred_language' in ('de', 'en') then p_data->>'preferred_language' else preferred_language end
  where id = v_sp.person_id;

  if v_sp.person_id <> v_me then
    perform log_audit('speaker.assistant_update', 'speaker_profile', v_sp.id::text, null, p_data - 'id');
  end if;
  return v_sp.id;
end $$;
