create or replace function shop_order_totals(p_order_id uuid)
 RETURNS TABLE(net_cents bigint, vat_cents bigint, gross_cents bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select coalesce(sum(round(sl.qty * sl.price_net_cents)), 0)::bigint,
         coalesce(sum(round(sl.qty * sl.price_net_cents * sl.vat_rate / 100)), 0)::bigint,
         coalesce(sum(round(sl.qty * sl.price_net_cents)) + sum(round(sl.qty * sl.price_net_cents * sl.vat_rate / 100)), 0)::bigint
  from shop_order_line sl where sl.order_id = p_order_id
$$;
