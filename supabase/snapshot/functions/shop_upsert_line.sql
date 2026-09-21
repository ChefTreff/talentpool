create or replace function shop_upsert_line(p_org_id uuid, p_sku text, p_qty numeric, p_merch_config jsonb DEFAULT NULL::jsonb, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_me uuid := current_person_id(); v_oe org_edition; v_phase jsonb; v_p integer; v_late boolean; v_o shop_order; v_pr product; v_free integer; v_other integer;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  v_phase := shop_phase(v_oe.edition_id); v_p := (v_phase->>'phase')::integer; v_late := (v_phase->>'late_only')::boolean;
  if v_p = 0 then raise exception 'phase_closed' using errcode = 'P0001'; end if;
  if not (org_has_booth(v_oe.id) or shop_sku_via_deliverable(v_oe.id, p_sku)) then
    raise exception 'booth_required' using errcode = 'P0001', detail = p_sku;
  end if;
  select * into v_pr from product where sku = p_sku and active;
  if not found then raise exception 'unknown_sku' using errcode = '22023', detail = p_sku; end if;
  if not v_pr.shop_visible and not shop_sku_via_deliverable(v_oe.id, p_sku) then
    raise exception 'unknown_sku' using errcode = '22023', detail = p_sku;
  end if;
  if coalesce(v_pr.net_price_cents, 0) = 0 then raise exception 'request_only' using errcode = '22023', detail = p_sku; end if;
  if v_late and not v_pr.late_orderable then raise exception 'late_only' using errcode = 'P0001', detail = p_sku; end if;
  if v_pr.available_until is not null and v_pr.available_until <= now() then raise exception 'not_available' using errcode = 'P0001', detail = p_sku; end if;
  if v_pr.edition_id is not null and v_pr.edition_id <> v_oe.edition_id then raise exception 'wrong_edition' using errcode = '22023', detail = p_sku; end if;
  select * into v_o from shop_order where org_edition_id = v_oe.id and phase = v_p and status in ('draft', 'pending', 'editing') for update;
  if not found then
    if coalesce(p_qty, 0) <= 0 then raise exception 'empty_order' using errcode = '22023'; end if;
    insert into shop_order (org_edition_id, order_no, phase, status, created_by)
    values (v_oe.id, 'MS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('shop_order_seq')::text, 4, '0'), v_p, 'draft', v_me) returning * into v_o;
  elsif v_o.status = 'pending' then
    raise exception 'order_pending' using errcode = 'P0001', detail = v_o.id::text;
  end if;
  if coalesce(p_qty, 0) > 0 and v_pr.track_stock then
    v_free := coalesce(shop_stock_available(p_sku), 0);
    v_other := coalesce(shop_order_reserved(v_o.id, p_sku), 0);
    if p_qty > v_free + v_other then
      raise exception 'out_of_stock' using errcode = 'P0001', detail = p_sku || ':' || (v_free + v_other)::text;
    end if;
  end if;
  if coalesce(p_qty, 0) <= 0 then
    delete from shop_order_line where order_id = v_o.id and product_sku = p_sku;
  else
    insert into shop_order_line (order_id, product_sku, name_de, name_en, category, unit, vat_rate, price_net_cents, qty, merch_config)
    values (v_o.id, p_sku, v_pr.name_de, v_pr.name_en, v_pr.category, v_pr.unit, v_pr.vat_rate, v_pr.net_price_cents, p_qty, p_merch_config)
    on conflict (order_id, product_sku) do update set qty = excluded.qty, merch_config = coalesce(excluded.merch_config, shop_order_line.merch_config),
      name_de = excluded.name_de, name_en = excluded.name_en, category = excluded.category, unit = excluded.unit, vat_rate = excluded.vat_rate, price_net_cents = excluded.price_net_cents;
  end if;
  update shop_order set updated_at = now() where id = v_o.id;
  return v_o.id;
end $$;
