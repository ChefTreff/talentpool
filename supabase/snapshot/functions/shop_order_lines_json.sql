create or replace function shop_order_lines_json(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(jsonb_agg(jsonb_build_object('sku', sl.product_sku, 'name_de', sl.name_de, 'name_en', sl.name_en, 'category', sl.category, 'unit', sl.unit,
                                                 'vat_rate', sl.vat_rate, 'price_net_cents', sl.price_net_cents, 'qty', sl.qty,
                                                 'line_net_cents', round(sl.qty * sl.price_net_cents)::integer, 'merch_config', sl.merch_config) order by sl.created_at), '[]'::jsonb)
  from shop_order_line sl where sl.order_id = p_order_id
$$;
