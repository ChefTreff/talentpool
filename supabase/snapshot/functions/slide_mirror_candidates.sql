create or replace function slide_mirror_candidates(p_edition_id uuid DEFAULT NULL::uuid, p_asset_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(asset_id uuid, asset_version integer, profile_id uuid, session_id uuid, edition_id uuid, storage_path text, filename text, mime text, size_bytes bigint, first_name text, last_name text, session_title text, slot_id uuid, slot_start timestamp with time zone, stage_id uuid, stage_name text, event_day_id uuid, day_date date, day_label text, timezone text, folder_id text, mirror_id uuid, drive_file_id text, mirror_asset_id uuid, target_hash text, mirror_status text, error_key text, error_detail text, attempts integer, mirrored_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select a.id, a.version, a.profile_id, a.session_id, sp.edition_id,
         a.storage_path, a.filename, a.mime, a.size_bytes,
         -- Nur die zwei Namensfelder, nie `person` als Ganzes (Konvention §2).
         p.first_name, p.last_name, coalesce(se.title_de, se.title_en),
         sl.id, sl.start_at, st.id, st.name,
         d.id, d.day_date, coalesce(d.label_de, d.label_en), coalesce(ev.timezone, 'Europe/Berlin'),
         ds.folder_id,
         m.id, m.drive_file_id, m.asset_id, m.target_hash, m.status, m.error_key, m.error_detail,
         m.attempts, m.mirrored_at
    from speaker_asset a
    join speaker_profile sp on sp.id = a.profile_id
    join person p on p.id = sp.person_id
    join session se on se.id = a.session_id
    left join slot sl on sl.id = se.slot_id
    left join stage st on st.id = sl.stage_id
    left join event_day d on d.id = sl.event_day_id
    left join event ev on ev.id = coalesce(st.event_id, se.event_id)
    left join slide_drive_setting ds on ds.edition_id = sp.edition_id
    left join slide_drive_mirror m on m.profile_id = a.profile_id and m.session_id = a.session_id
   where a.kind = 'presentation'
     and a.is_current
     and a.session_id is not null
     and (p_edition_id is null or sp.edition_id = p_edition_id)
     and (p_asset_id is null or a.id = p_asset_id)
   order by d.day_date nulls last, st.sort_order nulls last, sl.start_at nulls last, p.last_name, p.first_name;
end $$;
