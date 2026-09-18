create or replace function shop_cancel(p_order_id uuid)
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
  if v_o.status not in ('draft', 'pending', 'editing') then raise exception 'not_cancellable' using errcode = 'P0001', detail = v_o.status; end if;
  select * into v_oe from org_edition where id = v_o.org_edition_id;
  if (shop_phase(v_oe.edition_id)->>'phase')::integer <> v_o.phase then raise exception 'phase_closed' using errcode = 'P0001'; end if;
  perform shop_reconcile_ledger(p_order_id, true);
  update shop_order set status = 'cancelled', cancelled_at = now() where id = p_order_id;
  perform log_audit('shop.cancel', 'shop_order', p_order_id::text, jsonb_build_object('status', v_o.status), null);
end $$;
