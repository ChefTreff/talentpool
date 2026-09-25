create or replace function register_session_asset(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_session uuid := nullif(p_data->>'session_id', '')::uuid;
        v_kind text := nullif(p_data->>'kind', '');
        v_path text := nullif(btrim(p_data->>'storage_path'), '');
        v_id uuid; v_version integer; v_erstes boolean; r record;
begin
  if not is_marketing_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_kind not in ('stage_photo', 'slot_graphic') then
    raise exception 'invalid_kind' using errcode = '22023', detail = coalesce(v_kind, 'null');
  end if;
  if not exists (select 1 from session se where se.id = v_session) then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if v_path is null or split_part(v_path, '/', 1) <> v_session::text
     or split_part(v_path, '/', 2) <> v_kind then
    raise exception 'invalid_path' using errcode = '22023', detail = coalesce(v_path, 'null');
  end if;

  v_erstes := not exists (select 1 from session_asset a
                           where a.session_id = v_session and a.kind = 'stage_photo');
  select coalesce(max(a.version), 0) + 1 into v_version
    from session_asset a where a.session_id = v_session and a.kind = v_kind;

  if v_kind = 'slot_graphic' then
    update session_asset set is_current = false
     where session_id = v_session and kind = 'slot_graphic' and is_current;
  end if;

  insert into session_asset (session_id, kind, storage_path, filename, mime, size_bytes,
                             width, height, cutout, credit, version, uploaded_by)
  values (v_session, v_kind, v_path, coalesce(nullif(btrim(p_data->>'filename'), ''), 'datei'),
          nullif(p_data->>'mime', ''), (p_data->>'size_bytes')::bigint,
          (p_data->>'width')::integer, (p_data->>'height')::integer,
          coalesce((p_data->>'cutout')::boolean, false),
          nullif(btrim(p_data->>'credit'), ''), v_version, current_person_id())
  returning id into v_id;

  if v_kind = 'stage_photo' and v_erstes then
    for r in
      select ss.person_id, coalesce(se.title_de, se.title_en) as titel
        from session_speaker ss join session se on se.id = ss.session_id
        join event ev on ev.id = se.event_id
       where ss.session_id = v_session
         -- SPK-070 / LEAD-042: die Mail führt ins Speaker-Portal. Sie geht deshalb
         -- nur an Speaker mit Profil dieser Edition — nicht an Gäste des Partners
         -- und nicht an eine Moderation ohne Profil (etwa einen Stage Lead).
         and exists (select 1 from speaker_profile sp
                      where sp.person_id = ss.person_id
                        and sp.edition_id = coalesce(ev.edition_id, ev.id)
                        and not sp.stage_guest)
    loop
      perform queue_mail('stage_photos_ready', r.person_id,
                         jsonb_build_object('session_title', coalesce(r.titel, '')),
                         'session', v_session);
    end loop;
  end if;

  perform log_audit('session_asset.register', 'session_asset', v_id::text, null,
                    jsonb_build_object('session_id', v_session, 'kind', v_kind, 'version', v_version));
  return v_id;
end $$;
