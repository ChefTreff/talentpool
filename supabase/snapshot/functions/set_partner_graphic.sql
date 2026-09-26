create or replace function set_partner_graphic(p_org_id uuid, p_storage_path text, p_filename text, p_mime text DEFAULT NULL::text, p_size_bytes bigint DEFAULT NULL::bigint, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_version integer; v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not (is_staff() or is_marketing_team() or is_partner_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  -- Derselbe Zuschnitt wie bei den übrigen Dateien der Organisation: <edition>/<org>/<art>/<datei>.
  if p_storage_path is null
     or p_storage_path not like v_oe.edition_id::text || '/' || p_org_id::text || '/partner_graphic/%' then
    raise exception 'path_mismatch' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'partner-assets' and o.name = p_storage_path) then
    raise exception 'object_not_found' using errcode = 'P0002';
  end if;
  -- Eine Grafik zum Teilen: Bild oder PDF.
  if coalesce(p_mime, '') not in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf') then
    raise exception 'file_rules' using errcode = '22023', detail = 'mime:' || coalesce(nullif(p_mime, ''), '?');
  end if;

  select coalesce(max(version), 0) + 1 into v_version from partner_asset
   where org_edition_id = v_oe.id and kind = 'partner_graphic' and deliverable_id is null;
  update partner_asset set is_current = false
   where org_edition_id = v_oe.id and kind = 'partner_graphic' and is_current;
  -- Vom Team angelegt, also gleich angenommen — es gibt nichts zu prüfen.
  insert into partner_asset (org_edition_id, kind, storage_path, filename, mime, size_bytes, version,
                             status, reviewed_by, reviewed_at, uploaded_by)
  values (v_oe.id, 'partner_graphic', p_storage_path, coalesce(nullif(btrim(p_filename), ''), 'partnergrafik'),
          p_mime, p_size_bytes, v_version, 'accepted', v_me, now(), v_me)
  returning id into v_id;
  perform log_audit('partner.graphic', 'organization', p_org_id::text, null,
                    jsonb_build_object('asset_id', v_id, 'version', v_version, 'edition_id', v_oe.edition_id));
  return jsonb_build_object('id', v_id, 'version', v_version);
end $$;
