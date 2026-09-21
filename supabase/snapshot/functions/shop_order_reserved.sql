create or replace function shop_order_reserved(p_order_id uuid, p_sku text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(-sum(l.delta), 0)::integer from stock_ledger l where l.order_id = p_order_id and l.product_sku = p_sku
$$;
