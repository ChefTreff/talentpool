create or replace function my_session_slides()
 RETURNS TABLE(asset_id uuid, session_id uuid, session_title_de text, session_title_en text, speaker_name text, filename text, storage_path text, slot_end_at timestamp with time zone, edition_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select sa.id, s.id, s.title_de, s.title_en,
           nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
           sa.filename, sa.storage_path, sl.end_at,
           coalesce(ev.edition_id, ev.id)
      from speaker_asset sa
      join session s        on s.id = sa.session_id
      join slot sl          on sl.id = s.slot_id
      join event ev         on ev.id = s.event_id
      join speaker_profile sp on sp.id = sa.profile_id
      left join person p    on p.id = sp.person_id
     where sa.kind = 'presentation'
       and sa.is_current
       and sa.slides_release
       and s.publish_status = 'published'
       and now() > sl.end_at
       and exists (
         select 1 from ticket t join event te on te.id = t.event_id
          where t.person_id = v_me
            and t.status in ('valid', 'checked_in')
            and coalesce(te.edition_id, te.id) = coalesce(ev.edition_id, ev.id)
       )
     order by sl.end_at, s.title_de, sa.filename;
end $$;
