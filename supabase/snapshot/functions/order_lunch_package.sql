create or replace function order_lunch_package(p_org_id uuid, p_qty integer, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; v_order uuid; v_sku text; v_fremde integer; v_confirm boolean;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  if coalesce(p_qty, 0) <= 0 then raise exception 'invalid_qty' using errcode = '22023', detail = coalesce(p_qty::text, 'null'); end if;

  select t.fulfilled_by_sku into v_sku from deliverable_template t where t.key = 'lunch_package' and t.active;
  if v_sku is null then raise exception 'deliverable_not_found' using errcode = 'P0002', detail = 'lunch_package'; end if;

  v_order := shop_upsert_line(p_org_id, v_sku, p_qty, null, p_edition_id);

  select count(*)::integer into v_fremde
    from shop_order_line l where l.order_id = v_order and l.product_sku <> v_sku;
  v_confirm := (v_fremde = 0);

  if v_confirm then
    perform shop_confirm(v_order, null, null);
  end if;
  perform log_audit('shop.lunch_package', 'shop_order', v_order::text, null,
                    jsonb_build_object('org_id', p_org_id, 'sku', v_sku, 'qty', p_qty, 'confirmed', v_confirm));
  return jsonb_build_object('order_id', v_order, 'sku', v_sku, 'qty', p_qty, 'confirmed', v_confirm);
end $$;
