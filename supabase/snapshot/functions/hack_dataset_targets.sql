create or replace function hack_dataset_targets(p_edition_id uuid DEFAULT NULL::uuid, p_language text DEFAULT 'en'::text)
 RETURNS TABLE(challenge_id uuid, title text, org_name text, dataset_id uuid, storage_path text, filename text, size_bytes bigint, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select c.id, hack_text(c.title_de, c.title_en, p_language), coalesce(o.communication_name, o.legal_name),
           d.id, d.storage_path, d.filename, d.size_bytes, d.created_at
      from hack_challenge c
      left join organization o on o.id = c.org_id
      left join hack_dataset d on d.challenge_id = c.id and d.is_current
     where c.edition_id = hack_edition(p_edition_id) and c.status = 'published'
       and can_manage_hack_dataset(c.id)
     order by c.sort_order, hack_text(c.title_de, c.title_en, p_language);
end $$;
