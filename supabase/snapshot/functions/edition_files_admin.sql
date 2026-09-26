create or replace function edition_files_admin(p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, edition_id uuid, edition_slug text, kind text, storage_path text, filename text, mime text, size_bytes bigint, label_de text, label_en text, audience text[], sort_order integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not (is_staff() or is_production_team() or is_marketing_team()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select f.id, f.edition_id, e.slug, f.kind, f.storage_path, f.filename, f.mime, f.size_bytes,
           f.label_de, f.label_en, f.audience, f.sort_order, f.created_at
      from edition_file f join event e on e.id = f.edition_id
     where (p_edition_id is null or f.edition_id = p_edition_id)
       -- PART-041: wer nur das Media Kit pflegt, sieht auch nur dessen Dateien.
       and (is_staff() or is_production_team() or f.kind = 'media_kit')
     order by e.start_date desc nulls last, f.kind, f.sort_order;
end $$;
