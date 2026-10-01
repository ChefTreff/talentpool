create or replace function set_edition_slides_folder(p_edition_id uuid, p_folder_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me  uuid := current_person_id();
  v_neu text := nullif(btrim(coalesce(p_folder_id, '')), '');
  v_alt text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('tech') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from event e where e.id = p_edition_id and e.is_edition) then
    raise exception 'edition_not_found' using errcode = 'P0002';
  end if;
  if v_neu is not null and v_neu !~ '^[A-Za-z0-9_-]{10,100}$' then
    raise exception 'invalid_folder_id' using errcode = '22023';
  end if;
  select s.folder_id into v_alt from slide_drive_setting s where s.edition_id = p_edition_id;
  if v_neu is null then
    -- Leer heisst: nicht mehr spiegeln. Was schon drüben liegt, bleibt dort.
    delete from slide_drive_setting where edition_id = p_edition_id;
  else
    insert into slide_drive_setting (edition_id, folder_id, updated_by, updated_at)
    values (p_edition_id, v_neu, v_me, now())
    on conflict (edition_id) do update
      set folder_id = excluded.folder_id, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform log_audit('edition.slides_folder', 'event', p_edition_id::text,
    jsonb_build_object('folder_id', v_alt), jsonb_build_object('folder_id', v_neu));
end $$;
