create or replace function shop_admin_set_status(p_order_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_o shop_order;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('pending', 'editing', 'completed', 'cancelled') then raise exception 'invalid_status' using errcode = '22023', detail = p_status; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if p_status = 'cancelled' then
    perform shop_reconcile_ledger(p_order_id, true);
  elsif p_status = 'completed' then
    if not exists (select 1 from shop_order_line where order_id = p_order_id) then raise exception 'empty_order' using errcode = '22023'; end if;
    perform shop_reconcile_ledger(p_order_id, false);
  elsif v_o.status = 'cancelled' then
    perform shop_reconcile_ledger(p_order_id, false);
  end if;
  update shop_order set status = p_status,
                        completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
                        cancelled_at = case when p_status = 'cancelled' then now() else null end,
                        confirmed_at = case when p_status in ('pending', 'completed') then coalesce(confirmed_at, now()) else confirmed_at end,
                        internal_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), internal_note)
   where id = p_order_id;
  perform log_audit('shop.admin_status', 'shop_order', p_order_id::text, jsonb_build_object('status', v_o.status), jsonb_build_object('status', p_status, 'note', p_note));
end $$;
