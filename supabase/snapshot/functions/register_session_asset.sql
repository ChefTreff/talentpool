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
    -- PART-091: je Empfänger eine Mail — ein Kontakt, der mehrere Speaker der
    -- Session verwaltet, bekommt eine, die sie alle nennt.
    for r in
      select speaker_mail_recipient(sp.id) as recipient, coalesce(se.title_de, se.title_en) as titel,
             string_agg(distinct case when speaker_mail_recipient(sp.id) is distinct from ss.person_id
                                      then nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') end,
                        ', ') as fuer
        from session_speaker ss join session se on se.id = ss.session_id
        join event ev on ev.id = se.event_id
        -- SPK-070 / LEAD-042: die Mail führt ins Speaker-Portal. Sie geht deshalb
        -- nur an Speaker mit Profil dieser Edition — nicht an Gäste des Partners
        -- und nicht an eine Moderation ohne Profil (etwa einen Stage Lead).
        join speaker_profile sp on sp.person_id = ss.person_id
                               and sp.edition_id = coalesce(ev.edition_id, ev.id)
                               and not sp.stage_guest
        join person p on p.id = ss.person_id
       where ss.session_id = v_session
       group by 1, 2
    loop
      perform queue_mail('stage_photos_ready', r.recipient,
                         jsonb_build_object('session_title', coalesce(r.titel, ''))
                           || case when r.fuer is not null then jsonb_build_object('on_behalf_of', r.fuer) else '{}'::jsonb end,
                         'session', v_session);
    end loop;
  end if;

  perform log_audit('session_asset.register', 'session_asset', v_id::text, null,
                    jsonb_build_object('session_id', v_session, 'kind', v_kind, 'version', v_version));
  return v_id;
end $$;
