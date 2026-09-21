create or replace function upsert_product_component(p_bundle_sku text, p_component_sku text, p_qty numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_qty is null or p_qty <= 0 then
    delete from product_component where bundle_sku = p_bundle_sku and component_sku = p_component_sku;
  else
    insert into product_component (bundle_sku, component_sku, qty) values (p_bundle_sku, p_component_sku, p_qty)
    on conflict (bundle_sku, component_sku) do update set qty = excluded.qty;
  end if;
  perform log_audit('product.component', 'product', p_bundle_sku, null, jsonb_build_object('component', p_component_sku, 'qty', p_qty));
end $$;
