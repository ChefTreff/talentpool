create or replace function supplier_order_list(p_edition_id uuid, p_supplier text DEFAULT NULL::text)
 RETURNS TABLE(supplier text, product_sku text, product_name text, unit text, qty numeric, orgs integer, purchase_price_cents integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_production_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select coalesce(p.supplier, ''), p.sku, coalesce(p.name_de, p.name_en), p.unit,
           sum(op.qty), count(distinct oe.org_id)::integer, p.purchase_price_cents
      from org_edition oe
      join org_product op on op.org_edition_id = oe.id
      join product p on p.sku = op.product_sku
     where oe.edition_id = p_edition_id
       and op.status <> 'cancelled'
       and p.type in ('shop_item', 'addon')
       and coalesce(p.category, '') <> 'tickets'
       and p.pass_type is null
       and (p_supplier is null or p.supplier = p_supplier)
     group by p.supplier, p.sku, p.name_de, p.name_en, p.unit, p.purchase_price_cents
     order by coalesce(p.supplier, ''), p.sku;
end $$;
