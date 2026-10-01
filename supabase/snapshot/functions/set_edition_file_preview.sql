create or replace function set_edition_file_preview(p_id uuid, p_path text, p_width integer, p_height integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_storage text;
begin
  -- Nur der Server nach der Rollenprüfung der Route; eine Sitzung hat hier nichts zu tun.
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  select f.storage_path into v_storage from edition_file f where f.id = p_id;
  if not found then raise exception 'edition_file_not_found' using errcode = 'P0002', detail = coalesce(p_id::text, 'null'); end if;
  if p_path is distinct from v_storage || '.preview.webp' then
    raise exception 'invalid_path' using errcode = '22023', detail = coalesce(p_path, 'null');
  end if;
  update edition_file
     set preview_path = p_path, preview_width = p_width, preview_height = p_height, updated_at = now()
   where id = p_id;
end $$;
