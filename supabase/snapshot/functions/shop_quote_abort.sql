create or replace function shop_quote_abort(p_order_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_o shop_order;
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_o.status <> 'quoted' then return; end if;
  if v_o.quote_valid_until is not null then raise exception 'quote_recorded' using errcode = 'P0001'; end if;
  perform shop_reconcile_ledger(p_order_id, true);
  update shop_order set status = 'draft', quote_started_at = null, quote_valid_until = null where id = p_order_id;
  perform log_audit('shop.quote_aborted', 'shop_order', p_order_id::text, null,
                    jsonb_build_object('order_no', v_o.order_no, 'reason', left(coalesce(nullif(btrim(p_reason), ''), 'unknown'), 40)));
end $$;
