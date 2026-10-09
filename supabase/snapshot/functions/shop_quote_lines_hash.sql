create or replace function shop_quote_lines_hash(p_order_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select md5(coalesce((select string_agg(l.product_sku || ':' || l.qty::text || ':' || l.price_net_cents::text || ':' || l.vat_rate::text, '|' order by l.product_sku)
                         from shop_order_line l where l.order_id = p_order_id), ''))
$$;
