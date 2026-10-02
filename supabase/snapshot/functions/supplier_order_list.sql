create or replace function supplier_order_list(p_edition_id uuid, p_supplier text DEFAULT NULL::text)
 RETURNS TABLE(supplier text, product_sku text, product_name text, unit text, qty numeric, orgs integer, purchase_price_cents integer, qty_package numeric, qty_offer numeric, qty_shop numeric, qty_shop_open numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_admin_section('productionOrders') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select coalesce(p.supplier, ''), p.sku, coalesce(p.name_de, p.name_en), p.unit,
           sum(l.qty_package + l.qty_offer + l.qty_shop), count(distinct l.org_id)::integer, p.purchase_price_cents,
           sum(l.qty_package), sum(l.qty_offer), sum(l.qty_shop), sum(l.qty_shop_open)
      from booth_production_lines(p_edition_id) l
      join product p on p.sku = l.product_sku
     where (p_supplier is null or p.supplier = p_supplier)
     group by p.supplier, p.sku, p.name_de, p.name_en, p.unit, p.purchase_price_cents
     order by coalesce(p.supplier, ''), p.sku;
end $$;
