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
  if v_sp.person_id <> current_person_id() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_release and not coalesce((select c.granted from consent_current c where c.person_id = v_sp.person_id and c.consent_type = 'slides_publication'), false) then
    raise exception 'consent_required' using errcode = 'P0001', detail = 'slides_publication';
  end if;
  update speaker_asset set slides_release = p_release where id = p_asset_id;
  perform log_audit('speaker.slides_release', 'speaker_asset', p_asset_id::text, null, jsonb_build_object('release', p_release));
end $$;
