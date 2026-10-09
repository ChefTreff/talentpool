create or replace function shop_quote_withdraw(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_o shop_order;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if not partner_can_edit(shop_order_org(p_order_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status <> 'quoted' then raise exception 'not_quoted' using errcode = 'P0001', detail = v_o.status; end if;
  perform shop_reconcile_ledger(p_order_id, true);
  update shop_order set status = 'draft', quote_started_at = null, quote_valid_until = null where id = p_order_id;
  update external_ref set meta = meta || jsonb_build_object('closed', 'withdrawn', 'closed_at', now())
   where system = 'sevdesk' and object_type = 'shop_quote' and object_id = p_order_id;
  perform log_audit('shop.quote_withdrawn', 'shop_order', p_order_id::text, jsonb_build_object('status', 'quoted'), jsonb_build_object('order_no', v_o.order_no));
end $$;
