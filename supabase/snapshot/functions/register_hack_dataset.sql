create or replace function register_hack_dataset(p_challenge_id uuid, p_storage_path text, p_filename text, p_mime text DEFAULT NULL::text, p_size_bytes bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_manage_hack_dataset(p_challenge_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_storage_path is null or p_storage_path not like p_challenge_id::text || '/%'
     or split_part(p_storage_path, '/', 3) <> '' or split_part(p_storage_path, '/', 2) = '' then
    raise exception 'path_mismatch' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'hack-datasets' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002';
  end if;
  if p_size_bytes is not null and (p_size_bytes < 1 or p_size_bytes > 52428800) then
    raise exception 'file_rules' using errcode = '22023', detail = 'max_bytes';
  end if;
  update hack_dataset set is_current = false where challenge_id = p_challenge_id and is_current;
  insert into hack_dataset (challenge_id, storage_path, filename, mime, size_bytes, uploaded_by)
  values (p_challenge_id, p_storage_path, left(coalesce(nullif(btrim(p_filename), ''), 'dataset'), 200),
          nullif(btrim(coalesce(p_mime, '')), ''), p_size_bytes, v_me)
  returning id into v_id;
  perform log_audit('hack.dataset_uploaded', 'hack_challenge', p_challenge_id::text, null,
                    jsonb_build_object('dataset_id', v_id, 'filename', p_filename, 'size_bytes', p_size_bytes));
  return v_id;
end $$;
