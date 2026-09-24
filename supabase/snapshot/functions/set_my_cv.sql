create or replace function set_my_cv(p_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_path text := nullif(btrim(p_path), ''); v_old text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_path is not null then
    if v_path not like v_me::text || '/%' or split_part(v_path, '/', 3) <> '' then
      raise exception 'path_mismatch' using errcode = '22023';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'person-cv' and o.name = v_path) then
      raise exception 'object_not_found' using errcode = 'P0002';
    end if;
  end if;

  select p.cv_path into v_old from person p where p.id = v_me;
  if v_old is not distinct from v_path then return; end if;

  update person set cv_path = v_path where id = v_me;
  if v_old is not null then
    insert into storage_purge_queue (bucket, path, reason)
    values ('person-cv', v_old, 'cv_replaced')
    on conflict (bucket, path) do nothing;
  end if;
end $$;
