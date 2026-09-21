create or replace function shop_reconcile_ledger(p_order_id uuid, p_release boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; v_n integer := 0; v_target integer; v_reserved integer; v_diff integer; v_avail integer;
begin
  if p_release then
    for r in select l.product_sku, -sum(l.delta)::integer as reserved from stock_ledger l where l.order_id = p_order_id group by l.product_sku having -sum(l.delta) <> 0 loop
      insert into stock_ledger (product_sku, order_id, delta, comment, created_by) values (r.product_sku, p_order_id, r.reserved, 'release', current_person_id());
      v_n := v_n + 1;
    end loop;
    return v_n;
  end if;
  -- Zeilen, die nicht mehr da sind, freigeben
  for r in select l.product_sku, -sum(l.delta)::integer as reserved from stock_ledger l where l.order_id = p_order_id
           and not exists (select 1 from shop_order_line sl where sl.order_id = p_order_id and sl.product_sku = l.product_sku)
           group by l.product_sku having -sum(l.delta) <> 0 loop
    insert into stock_ledger (product_sku, order_id, delta, comment, created_by) values (r.product_sku, p_order_id, r.reserved, 'line removed', current_person_id());
    v_n := v_n + 1;
  end loop;
  for r in select sl.product_sku, sl.qty from shop_order_line sl join product p on p.sku = sl.product_sku where sl.order_id = p_order_id and p.track_stock loop
    v_target := ceil(r.qty)::integer;
    v_reserved := shop_order_reserved(p_order_id, r.product_sku);
    v_diff := v_target - v_reserved;
    if v_diff > 0 then
      v_avail := shop_stock_available(r.product_sku);
      if v_avail is not null and v_avail < v_diff then raise exception 'out_of_stock' using errcode = 'P0001', detail = r.product_sku || ':' || v_avail::text; end if;
    end if;
    if v_diff <> 0 then
      insert into stock_ledger (product_sku, order_id, delta, comment, created_by) values (r.product_sku, p_order_id, -v_diff, case when v_diff > 0 then 'reserve' else 'reduce' end, current_person_id());
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
