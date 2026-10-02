create or replace function booth_basis_hash(p_edition_id uuid, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_edition_id uuid, basis_hash text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select l.org_edition_id,
         md5(string_agg(l.product_sku || ':' || trim_scale(l.qty_package + l.qty_offer + l.qty_shop)::text,
                        ',' order by l.product_sku))
    from booth_production_lines(p_edition_id, p_org_id) l
   group by l.org_edition_id
$$;
