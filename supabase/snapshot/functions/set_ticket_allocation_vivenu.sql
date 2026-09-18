create or replace function set_ticket_allocation_vivenu(p_id uuid, p_status text, p_coupon_code text DEFAULT NULL::text, p_vivenu_coupon_id text DEFAULT NULL::text, p_vivenu_undershop_id text DEFAULT NULL::text, p_undershop_url text DEFAULT NULL::text, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('pending_vivenu', 'active', 'error', 'disabled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update org_ticket_allocation set
    status = p_status,
    coupon_code = coalesce(nullif(btrim(coalesce(p_coupon_code, '')), ''), coupon_code),
    vivenu_coupon_id = coalesce(nullif(btrim(coalesce(p_vivenu_coupon_id, '')), ''), vivenu_coupon_id),
    vivenu_undershop_id = coalesce(nullif(btrim(coalesce(p_vivenu_undershop_id, '')), ''), vivenu_undershop_id),
    undershop_url = coalesce(nullif(btrim(coalesce(p_undershop_url, '')), ''), undershop_url),
    last_error = case when p_status = 'error' then left(coalesce(p_error, ''), 500) else null end,
    synced_at = case when p_status in ('active', 'disabled') then now() else synced_at end
  where id = p_id;
  if not found then raise exception 'allocation_not_found' using errcode = 'P0002'; end if;
  perform log_audit('ticket.allocation_vivenu', 'org_ticket_allocation', p_id::text, null, jsonb_build_object('status', p_status, 'coupon_id', p_vivenu_coupon_id, 'undershop_id', p_vivenu_undershop_id, 'error', p_error));
end $$;
