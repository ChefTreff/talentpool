create or replace function shop_edit(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_o shop_order; v_oe org_edition;
begin
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if not partner_can_edit(shop_order_org(p_order_id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status <> 'pending' then raise exception 'not_pending' using errcode = 'P0001', detail = v_o.status; end if;
  select * into v_oe from org_edition where id = v_o.org_edition_id;
  if (shop_phase(v_oe.edition_id)->>'phase')::integer <> v_o.phase then raise exception 'phase_closed' using errcode = 'P0001'; end if;
  update shop_order set status = 'editing' where id = p_order_id;
  perform log_audit('shop.edit', 'shop_order', p_order_id::text, null, null);
end $$;
