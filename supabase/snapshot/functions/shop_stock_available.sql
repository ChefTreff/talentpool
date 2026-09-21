create or replace function shop_stock_available(p_sku text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select case when p.track_stock then coalesce(p.stock_total, 0) + coalesce((select sum(l.delta) from stock_ledger l where l.product_sku = p.sku), 0)::integer else null end
  from product p where p.sku = p_sku
$$;
