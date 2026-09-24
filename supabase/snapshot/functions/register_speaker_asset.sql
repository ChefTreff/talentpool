create or replace function register_speaker_asset(p_profile_id uuid, p_kind text, p_storage_path text, p_filename text, p_mime text DEFAULT NULL::text, p_size_bytes bigint DEFAULT NULL::bigint, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_version integer; v_late boolean := false; v_due timestamptz; v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me) or can_manage_speaker(p_profile_id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('presentation', 'photo', 'other', 'receipt') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_storage_path not like v_sp.edition_id::text || '/' || p_profile_id::text || '/' || p_kind || '/%' then
    raise exception 'path_mismatch' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'speaker-assets' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002';
  end if;
  if p_session_id is not null and not exists (select 1 from session_speaker ss where ss.session_id = p_session_id and ss.person_id = v_sp.person_id) then
    raise exception 'session_mismatch' using errcode = '22023';
  end if;
  if p_kind = 'presentation' and p_session_id is not null then
    v_due := (presentation_window(p_session_id)->>'effective_due')::timestamptz;
    v_late := v_due is not null and now() > v_due;
  end if;
  select coalesce(max(version), 0) + 1 into v_version
    from speaker_asset where profile_id = p_profile_id and kind = p_kind and coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_session_id, '00000000-0000-0000-0000-000000000000'::uuid);
  if p_kind in ('presentation', 'photo') then
    update speaker_asset set is_current = false
     where profile_id = p_profile_id and kind = p_kind and is_current
       and coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_session_id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  insert into speaker_asset (profile_id, session_id, kind, storage_path, filename, mime, size_bytes, version, late, uploaded_by)
  values (p_profile_id, p_session_id, p_kind, p_storage_path, p_filename, p_mime, p_size_bytes, v_version, v_late, v_me)
  returning id into v_id;
  if p_kind = 'photo' then update speaker_profile set photo_asset_id = v_id where id = p_profile_id; end if;
  perform log_audit('speaker.asset', 'speaker_profile', p_profile_id::text, null,
    jsonb_build_object('asset_id', v_id, 'kind', p_kind, 'version', v_version, 'late', v_late, 'session_id', p_session_id));
  return jsonb_build_object('id', v_id, 'version', v_version, 'late', v_late, 'effective_due', v_due);
end $$;
