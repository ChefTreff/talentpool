create or replace function register_sevdesk_document(p_org_edition_id uuid, p_kind text, p_storage_path text, p_filename text, p_size_bytes bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; v_id uuid;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind not in ('offer', 'invoice') then
    raise exception 'invalid_kind' using errcode = '22023', detail = coalesce(p_kind, 'null');
  end if;
  select * into v_oe from org_edition where id = p_org_edition_id;
  if not found then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_edition_id::text;
  end if;
  -- Der Pfad muss zur Organisation gehören, deren Beleg er trägt. Sonst
  -- schriebe ein vertauschtes Argument die Rechnung eines Partners in den
  -- Ordner eines anderen — und die Leseregel des Buckets liesse sie dort lesen.
  if p_storage_path not like v_oe.edition_id::text || '/' || v_oe.org_id::text || '/documents/%' then
    raise exception 'path_mismatch' using errcode = '22023', detail = p_storage_path;
  end if;
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'partner-assets' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002', detail = p_storage_path;
  end if;

  insert into partner_asset (org_edition_id, kind, storage_path, filename, mime,
                             size_bytes, version, is_current, status)
  values (p_org_edition_id, p_kind, p_storage_path, p_filename, 'application/pdf',
          p_size_bytes, 1, true, 'accepted')
  on conflict (storage_path) do update
     set filename = excluded.filename, size_bytes = excluded.size_bytes, updated_at = now()
  returning id into v_id;

  -- Kein `log_audit` je Beleg: der Lauf schreibt seine Zahlen als ein Eintrag
  -- in `integration.sync_job`, und hundert Protokollzeilen je Nacht sagen
  -- weniger als eine mit vier Zahlen.
  return v_id;
end $$;
