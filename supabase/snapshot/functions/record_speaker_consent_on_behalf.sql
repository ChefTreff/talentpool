create or replace function record_speaker_consent_on_behalf(p_profile_id uuid, p_consents jsonb, p_version text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_contact uuid;
  v_key text; v_val jsonb; v_granted boolean; v_vorher record; v_n integer := 0;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if v_sp.mail_via_contact_id is null then
    raise exception 'consent_not_managed' using errcode = 'P0001';
  end if;
  v_contact := speaker_consent_contact(p_profile_id, v_me);
  if v_contact is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_version is null or btrim(p_version) = '' then
    raise exception 'invalid_consents' using errcode = '22023', detail = 'version';
  end if;
  if p_consents is null or jsonb_typeof(p_consents) <> 'object' then
    raise exception 'invalid_consents' using errcode = '22023';
  end if;
  -- Erst alles prüfen, dann schreiben: ein unzulässiger Schlüssel lässt nichts halb stehen.
  for v_key, v_val in select e.key, e.value from jsonb_each(p_consents) e loop
    if v_key not in ('photo_video', 'speaker_release', 'slides_publication', 'hospitality_data') then
      -- Die vier Einwilligungen des Speaker-Portals (K-40, K-45); alles andere ist keine, die ein Kontakt geben kann.
      raise exception 'consent_type_not_allowed' using errcode = '22023', detail = v_key;
    end if;
    if jsonb_typeof(v_val) <> 'boolean' then
      raise exception 'invalid_consents' using errcode = '22023', detail = v_key;
    end if;
  end loop;

  for v_key, v_val in select e.key, e.value from jsonb_each(p_consents) e loop
    v_granted := v_val::boolean;
    select c.granted, c.version into v_vorher
      from consent_current c where c.person_id = v_sp.person_id and c.consent_type = v_key;
    -- Nur, was neu, umentschieden oder auf eine neuere Textfassung bezogen ist.
    if not found or v_vorher.granted is distinct from v_granted or v_vorher.version is distinct from btrim(p_version) then
      -- Ein Widerruf ist wie im Portal eine Zeile mit `granted = false`.
      -- `wording = 'proxy'`: bestätigt mit der stellvertretenden Textfassung (K-46).
      insert into consent_record (person_id, consent_type, version, granted, source, meta)
      values (v_sp.person_id, v_key, btrim(p_version), v_granted, 'stellvertretend',
              jsonb_build_object('by_person_id', v_me, 'contact_id', v_contact, 'profile_id', v_sp.id, 'wording', 'proxy'));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
