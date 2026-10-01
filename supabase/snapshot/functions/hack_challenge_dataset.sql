create or replace function hack_challenge_dataset(p_challenge_id uuid)
 RETURNS TABLE(dataset_id uuid, storage_path text, filename text, mime text, size_bytes bigint, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_read_hack_dataset(p_challenge_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select d.id, d.storage_path, d.filename, d.mime, d.size_bytes, d.created_at
      from hack_dataset d where d.challenge_id = p_challenge_id and d.is_current;
end $$;
