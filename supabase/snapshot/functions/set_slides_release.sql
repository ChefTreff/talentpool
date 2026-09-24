create or replace function set_slides_release(p_asset_id uuid, p_release boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a speaker_asset%rowtype; v_sp speaker_profile%rowtype;
begin
  select * into v_a from speaker_asset where id = p_asset_id for update;
  if not found then raise exception 'asset_not_found' using errcode = 'P0002'; end if;
  select * into v_sp from speaker_profile where id = v_a.profile_id;
  -- `coalesce`: ohne Person ist der Vergleich NULL, und `if NULL` löst nicht
  -- aus. Genau so ging die Freigabe für ein Konto ohne Person durch — belegt
  -- gegen die Live-Fassung (Kopf dieser Migration). Lehre aus 0118.
  if not coalesce(v_sp.person_id = current_person_id(), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Nur Präsentationen. Die Teilnehmerseite (TAL-001) liest freigegebene
  -- Folien; ein Häkchen an einem Foto oder einem Reisekosten-Beleg wäre dort
  -- eine Veröffentlichung, die niemand wollte.
  if v_a.kind <> 'presentation' then
    raise exception 'not_presentation' using errcode = '22023', detail = v_a.kind;
  end if;
  if p_release and not coalesce((select c.granted from consent_current c where c.person_id = v_sp.person_id and c.consent_type = 'slides_publication'), false) then
    raise exception 'consent_required' using errcode = 'P0001', detail = 'slides_publication';
  end if;
  update speaker_asset set slides_release = p_release where id = p_asset_id;
  perform log_audit('speaker.slides_release', 'speaker_asset', p_asset_id::text, null, jsonb_build_object('release', p_release));
end $$;
