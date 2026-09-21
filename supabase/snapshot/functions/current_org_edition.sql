create or replace function current_org_edition(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS org_edition
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select oe.* from org_edition oe join event e on e.id = oe.edition_id
  where oe.org_id = p_org_id and (p_edition_id is null or oe.edition_id = p_edition_id)
  order by e.start_date desc nulls last, oe.created_at desc limit 1
$$;
