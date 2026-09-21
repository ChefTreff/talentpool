create or replace function my_session_photos()
 RETURNS TABLE(id uuid, session_id uuid, session_title text, start_at timestamp with time zone, storage_path text, filename text, credit text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id();
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select a.id, a.session_id, coalesce(se.title_de, se.title_en), sl.start_at,
           a.storage_path, a.filename, a.credit, a.created_at
      from session_asset a
      join session se on se.id = a.session_id
      join session_speaker ss on ss.session_id = se.id and ss.person_id = v_me
      left join slot sl on sl.id = se.slot_id
     where a.kind = 'stage_photo' and a.is_current
     order by sl.start_at nulls last, a.created_at;
end $$;
