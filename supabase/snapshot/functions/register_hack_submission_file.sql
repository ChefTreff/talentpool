create or replace function register_hack_submission_file(p_team_id uuid, p_storage_path text, p_filename text, p_mime text DEFAULT NULL::text, p_size_bytes bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_id uuid; v_late boolean;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_write_hack_submission(p_team_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_storage_path is null or p_storage_path not like p_team_id::text || '/%'
     or split_part(p_storage_path, '/', 3) <> '' or split_part(p_storage_path, '/', 2) = '' then
    raise exception 'path_mismatch' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'hack-submissions' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002';
  end if;
  if p_size_bytes is not null and (p_size_bytes < 1 or p_size_bytes > 52428800) then
    raise exception 'file_rules' using errcode = '22023', detail = 'max_bytes';
  end if;
  perform 1 from hack_team where id = p_team_id for update;   -- Zählen und Einfügen ohne Wettlauf
  if (select count(*) from hack_submission_file where team_id = p_team_id) >= 10 then
    raise exception 'too_many_files' using errcode = '22023', detail = '10';
  end if;
  v_late := hack_submission_is_late(p_team_id);
  insert into hack_submission_file (team_id, storage_path, filename, mime, size_bytes, late, uploaded_by)
  values (p_team_id, p_storage_path, left(coalesce(nullif(btrim(p_filename), ''), 'datei'), 200),
          nullif(btrim(coalesce(p_mime, '')), ''), p_size_bytes, v_late, v_me)
  returning id into v_id;
  perform log_audit('hack.submission_file', 'hack_team', p_team_id::text, null,
                    jsonb_build_object('file_id', v_id, 'filename', p_filename, 'late', v_late));
  return v_id;
end $$;
