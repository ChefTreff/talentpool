create or replace function delete_speaker_asset(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id();
  v_a speaker_asset%rowtype;
  v_sp speaker_profile%rowtype;
  v_naechste uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select * into v_a from speaker_asset where id = p_id;
  if not found then raise exception 'asset_not_found' using errcode = 'P0002'; end if;

  select * into v_sp from speaker_profile where id = v_a.profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;

  -- Dieselbe Prüfung wie beim Hochladen. `coalesce` ist hier keine Zierde:
  -- ohne hinterlegte Assistenz wäre `is_speaker_assistant(...)` NULL und
  -- die ganze Kette NULL statt false (Hotfix 0118).
  if not coalesce((v_sp.person_id = v_me or is_speaker_assistant(v_sp.id, v_me)
                   or can_manage_speaker(v_a.profile_id)), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_a.kind <> 'presentation' then
    raise exception 'kind_not_deletable' using errcode = '22023', detail = v_a.kind;
  end if;

  delete from speaker_asset where id = p_id;

  -- War es die aktuelle Fassung, rückt die höchste verbliebene Version nach.
  if v_a.is_current then
    select a.id into v_naechste
      from speaker_asset a
     where a.profile_id = v_a.profile_id and a.kind = v_a.kind
       and coalesce(a.session_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(v_a.session_id, '00000000-0000-0000-0000-000000000000'::uuid)
     order by a.version desc limit 1;
    if v_naechste is not null then
      update speaker_asset set is_current = true where id = v_naechste;
    end if;
  end if;

  perform log_audit('speaker.asset_deleted', 'speaker_profile', v_a.profile_id::text, null,
    jsonb_build_object('asset_id', p_id, 'kind', v_a.kind, 'version', v_a.version,
                       'session_id', v_a.session_id, 'restored', v_naechste));
  return v_a.storage_path;
end $$;
