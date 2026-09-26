create or replace function delete_edition_file(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_path text;
begin
  if not (is_staff() or is_production_team()
          or (is_marketing_team() and exists (select 1 from edition_file f where f.id = p_id and f.kind = 'media_kit'))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from edition_file where id = p_id returning storage_path into v_path;
  if v_path is null then
    raise exception 'edition_file_not_found' using errcode = 'P0002', detail = p_id::text;
  end if;
  perform log_audit('edition_file.delete', 'edition_file', p_id::text, null, null);
  return v_path;
end $$;
