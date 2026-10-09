create or replace function shop_quotes_housekeeping()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare r record; v_expired integer := 0; v_stale integer := 0;
begin
  for r in select o.id from shop_order o where o.status = 'quoted' and o.quote_valid_until is not null and o.quote_valid_until < now() order by o.quote_valid_until for update loop
    perform shop_reconcile_ledger(r.id, true);
    update shop_order set status = 'draft', quote_started_at = null, quote_valid_until = null where id = r.id;
    update external_ref set meta = meta || jsonb_build_object('closed', 'expired', 'closed_at', now())
     where system = 'sevdesk' and object_type = 'shop_quote' and object_id = r.id;
    insert into audit_log (action, object_type, object_id, after) values ('shop.quote_expired', 'shop_order', r.id::text, null);
    v_expired := v_expired + 1;
  end loop;
  for r in select o.id from shop_order o where o.status = 'quoted' and o.quote_valid_until is null and o.quote_started_at < now() - interval '10 minutes' order by o.quote_started_at for update loop
    perform shop_reconcile_ledger(r.id, true);
    update shop_order set status = 'draft', quote_started_at = null, quote_valid_until = null where id = r.id;
    insert into audit_log (action, object_type, object_id, after) values ('shop.quote_aborted', 'shop_order', r.id::text, jsonb_build_object('reason', 'stale'));
    v_stale := v_stale + 1;
  end loop;
  return jsonb_build_object('expired', v_expired, 'stale', v_stale);
end $$;
