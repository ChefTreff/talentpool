create or replace function set_ticket_allocation(p_id uuid, p_quantity integer DEFAULT NULL::integer, p_coupon_code text DEFAULT NULL::text, p_undershop_url text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_a org_ticket_allocation;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_a from org_ticket_allocation where id = p_id for update;
  if not found then raise exception 'allocation_not_found' using errcode = 'P0002'; end if;
  if p_quantity is not null and p_quantity < 0 then raise exception 'invalid_quantity' using errcode = '22023'; end if;
  -- Die 100er-Zeile leitet `sync_ticket_allocations` aus den gebuchten Produkten
  -- ab (0123). Eine Menge von Hand wäre beim nächsten Lauf wieder weg — und
  -- niemand sähe, dass sie verschwunden ist.
  if p_quantity is not null and p_quantity <> v_a.quantity and v_a.discount_percent = 100 then
    raise exception 'derived_allocation' using errcode = 'P0001',
      detail = 'Die Menge der 100-Prozent-Zeile kommt aus den gebuchten Produkten.';
  end if;
  if p_status is not null and p_status not in ('pending_vivenu', 'active', 'error', 'disabled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update org_ticket_allocation set
    quantity = coalesce(p_quantity, quantity),
    coupon_code = case when p_coupon_code is not null then nullif(btrim(p_coupon_code), '') else coupon_code end,
    undershop_url = case when p_undershop_url is not null then nullif(btrim(p_undershop_url), '') else undershop_url end,
    status = coalesce(p_status, status),
    notes = case when p_notes is not null then nullif(btrim(p_notes), '') else notes end,
    last_error = case when p_status = 'active' then null else last_error end,
    synced_at = case when p_quantity is not null and p_quantity <> v_a.quantity and v_a.vivenu_coupon_id is not null then null else synced_at end
  where id = p_id;
  perform log_audit('ticket.allocation_set', 'org_ticket_allocation', p_id::text,
                    jsonb_build_object('quantity', v_a.quantity, 'coupon_code', v_a.coupon_code, 'status', v_a.status),
                    jsonb_build_object('quantity', p_quantity, 'coupon_code', p_coupon_code, 'undershop_url', p_undershop_url, 'status', p_status, 'notes', p_notes));
end $$;
