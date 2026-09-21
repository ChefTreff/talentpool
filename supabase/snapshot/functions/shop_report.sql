create or replace function shop_report(p_edition_id uuid)
 RETURNS TABLE(sku text, name_de text, category text, unit text, qty_total numeric, net_total_cents bigint, orders integer, orgs integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select sl.product_sku, max(sl.name_de), max(sl.category), max(sl.unit), sum(sl.qty), sum(round(sl.qty * sl.price_net_cents))::bigint,
           count(distinct o.id)::integer, count(distinct oe.org_id)::integer
    from shop_order_line sl join shop_order o on o.id = sl.order_id join org_edition oe on oe.id = o.org_edition_id
    where o.status = 'completed' and oe.edition_id = p_edition_id
    group by sl.product_sku
    order by max(sl.category), max(sl.name_de);
end $$;
