create or replace function booth_checklist(p_edition_id uuid, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_edition_id uuid, org_id uuid, org_name text, booth_number text, product_sku text, product_name text, supplier text, qty numeric, checked boolean, checked_at timestamp with time zone, checked_by_name text, note text, unit text, qty_package numeric, qty_offer numeric, qty_shop numeric, qty_shop_open numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not has_admin_section('productionBooths') then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select l.org_edition_id, l.org_id, coalesce(o.communication_name, o.legal_name), b.booth_number,
           p.sku, coalesce(p.name_de, p.name_en), p.supplier,
           l.qty_package + l.qty_offer + l.qty_shop,
           c.id is not null, c.checked_at,
           coalesce(pe.first_name || ' ' || pe.last_name, null), c.note,
           p.unit, l.qty_package, l.qty_offer, l.qty_shop, l.qty_shop_open
      from booth_production_lines(p_edition_id, p_org_id) l
      join organization o on o.id = l.org_id
      join product p on p.sku = l.product_sku
      left join lateral (
        select b2.booth_number from booth_assignment ba join booth b2 on b2.id = ba.booth_id
         where ba.org_edition_id = l.org_edition_id
         order by ba.event_day_id nulls first, b2.created_at limit 1) b on true
      left join booth_service_check c on c.org_edition_id = l.org_edition_id and c.product_sku = p.sku
      left join person pe on pe.id = c.checked_by
     order by coalesce(o.communication_name, o.legal_name), p.supplier, p.sku;
end $$;
