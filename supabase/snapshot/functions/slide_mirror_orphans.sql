create or replace function slide_mirror_orphans(p_limit integer DEFAULT 50)
 RETURNS TABLE(mirror_id uuid, drive_file_id text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select m.id, m.drive_file_id
    from slide_drive_mirror m
   where not exists (
           select 1
             from speaker_asset a
             join session se on se.id = a.session_id
            where a.profile_id = m.profile_id
              and a.session_id = m.session_id
              and a.kind = 'presentation'
              and a.is_current
              and se.slot_id is not null)
   order by m.updated_at
   limit greatest(1, least(coalesce(p_limit, 50), 500));
end $$;
