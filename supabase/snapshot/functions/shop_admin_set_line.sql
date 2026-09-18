create or replace function shop_admin_set_line(p_order_id uuid, p_sku text, p_qty numeric, p_merch_config jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_o shop_order; v_pr product;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_o.status = 'cancelled' then raise exception 'not_editable' using errcode = 'P0001', detail = v_o.status; end if;
  select * into v_pr from product where sku = p_sku;
  if not found then raise exception 'unknown_sku' using errcode = '22023', detail = p_sku; end if;
  if coalesce(p_qty, 0) <= 0 then
    delete from shop_order_line where order_id = p_order_id and product_sku = p_sku;
  else
    insert into shop_order_line (order_id, product_sku, name_de, name_en, category, unit, vat_rate, price_net_cents, qty, merch_config)
    values (p_order_id, p_sku, v_pr.name_de, v_pr.name_en, v_pr.category, v_pr.unit, v_pr.vat_rate, coalesce(v_pr.net_price_cents, 0), p_qty, p_merch_config)
    on conflict (order_id, product_sku) do update set qty = excluded.qty, merch_config = coalesce(excluded.merch_config, shop_order_line.merch_config);
  end if;
  if v_o.status in ('pending', 'editing', 'completed') then perform shop_reconcile_ledger(p_order_id, false); end if;
  update shop_order set updated_at = now() where id = p_order_id;
  perform log_audit('shop.admin_line', 'shop_order', p_order_id::text, null, jsonb_build_object('sku', p_sku, 'qty', p_qty));
end $$;
