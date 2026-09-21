create or replace function shop_remove_line(p_order_id uuid, p_sku text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_o shop_order;
begin
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if not partner_can_edit(shop_order_org(p_order_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status not in ('draft', 'editing') then raise exception 'not_editable' using errcode = 'P0001', detail = v_o.status; end if;
  delete from shop_order_line where order_id = p_order_id and product_sku = p_sku;
  update shop_order set updated_at = now() where id = p_order_id;
end $$;
