create or replace function register_partner_asset(p_org_id uuid, p_kind text, p_storage_path text, p_filename text, p_mime text DEFAULT NULL::text, p_size_bytes bigint DEFAULT NULL::bigint, p_deliverable_id uuid DEFAULT NULL::uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_d deliverable; v_t deliverable_template; v_rules jsonb; v_ext text; v_version integer; v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'invalid_kind' using errcode = '22023'; end if;
  -- PART-041: die Partnergrafik legt das Team über set_partner_graphic an, nicht der Partner.
  if p_kind = 'partner_graphic' then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  if p_storage_path not like v_oe.edition_id::text || '/' || p_org_id::text || '/' || p_kind || '/%' then raise exception 'path_mismatch' using errcode = '22023'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'partner-assets' and o.name = p_storage_path) then raise exception 'object_not_found' using errcode = 'P0002'; end if;
  v_ext := lower(nullif(regexp_replace(coalesce(p_filename, ''), '^.*\.', ''), coalesce(p_filename, '')));
  if p_deliverable_id is not null then
    select * into v_d from deliverable where id = p_deliverable_id and org_edition_id = v_oe.id;
    if not found then raise exception 'deliverable_not_found' using errcode = 'P0002'; end if;
    select * into v_t from deliverable_template where id = v_d.template_id;
    v_rules := coalesce(v_t.file_rules, '{}'::jsonb);
    if v_rules ? 'ext' and not (v_rules->'ext' @> to_jsonb(coalesce(v_ext, ''))) then
      raise exception 'file_rules' using errcode = '22023', detail = 'ext:' || coalesce(v_ext, '?') || ' allowed:' || (v_rules->>'ext');
    end if;
    if v_rules ? 'mime' and p_mime is not null and p_mime not in ('application/octet-stream', '') and not (v_rules->'mime' @> to_jsonb(p_mime)) then
      raise exception 'file_rules' using errcode = '22023', detail = 'mime:' || p_mime;
    end if;
    if v_rules ? 'max_bytes' and p_size_bytes is not null and p_size_bytes > (v_rules->>'max_bytes')::bigint then
      raise exception 'file_rules' using errcode = '22023', detail = 'max_bytes';
    end if;
  -- Vorher: ('svg', 'eps', 'ai', 'pdf'). Konrad, 22.09.: nur noch Vektordateien, die die
  -- Druckerei ohne Rueckfrage oeffnet. Dieser Zweig greift nur ohne `p_deliverable_id` —
  -- mit Pflicht gelten die `file_rules` der Vorlage, die oben angepasst sind.
  elsif p_kind = 'logo_vector' and coalesce(v_ext, '') not in ('svg', 'eps') then
    raise exception 'file_rules' using errcode = '22023', detail = 'logo_vector: svg, eps';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from partner_asset
   where org_edition_id = v_oe.id and kind = p_kind and coalesce(deliverable_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_deliverable_id, '00000000-0000-0000-0000-000000000000'::uuid);
  update partner_asset set is_current = false
   where org_edition_id = v_oe.id and kind = p_kind and is_current
     and coalesce(deliverable_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_deliverable_id, '00000000-0000-0000-0000-000000000000'::uuid);
  insert into partner_asset (org_edition_id, deliverable_id, kind, storage_path, filename, mime, size_bytes, version, uploaded_by)
  values (v_oe.id, p_deliverable_id, p_kind, p_storage_path, p_filename, p_mime, p_size_bytes, v_version, v_me)
  returning id into v_id;
  if p_kind = 'logo_vector' then perform partner_onboarding_recheck(v_oe.id); end if;
  perform log_audit('partner.asset', 'organization', p_org_id::text, null, jsonb_build_object('asset_id', v_id, 'kind', p_kind, 'version', v_version, 'deliverable_id', p_deliverable_id));
  return jsonb_build_object('id', v_id, 'version', v_version);
end $$;
