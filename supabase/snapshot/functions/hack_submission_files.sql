create or replace function hack_submission_files(p_team_id uuid DEFAULT NULL::uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(file_id uuid, team_id uuid, storage_path text, filename text, mime text, size_bytes bigint, late boolean, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_team_id is not null and not can_read_hack_submission(p_team_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select f.id, f.team_id, f.storage_path, f.filename, f.mime, f.size_bytes, f.late, f.created_at
      from hack_submission_file f
      join hack_team t on t.id = f.team_id
     where (p_team_id is null or f.team_id = p_team_id)
       and t.edition_id = hack_edition(p_edition_id)
       and can_read_hack_submission(f.team_id)
     order by f.team_id, f.created_at;
end $$;
