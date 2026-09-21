create or replace function assign_org_products(p_org_edition_id uuid, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_n integer := 0; v_item jsonb; v_sku text; v_qty numeric; v_vorher jsonb;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' then
    raise exception 'invalid_items' using errcode = '22023', detail = 'Array erwartet';
  end if;
  if not exists (select 1 from org_edition where id = p_org_edition_id) then
    raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_edition_id::text;
  end if;

  -- Erst prüfen, dann schreiben: eine unbekannte SKU mitten im Lauf hinterliesse
  -- sonst einen halb ersetzten Stand.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sku := nullif(btrim(v_item->>'sku'), '');
    v_qty := coalesce((v_item->>'qty')::numeric, 1);
    if v_sku is null then
      raise exception 'invalid_items' using errcode = '22023', detail = 'sku fehlt';
    end if;
    if v_qty <= 0 then
      raise exception 'invalid_items' using errcode = '22023', detail = v_sku || ': qty muss > 0 sein';
    end if;
    if not exists (select 1 from product p where p.sku = v_sku and p.active) then
      raise exception 'unknown_sku' using errcode = 'P0002', detail = v_sku;
    end if;
  end loop;

  select jsonb_agg(jsonb_build_object('sku', op.product_sku, 'qty', op.qty))
    into v_vorher from org_product op
   where op.org_edition_id = p_org_edition_id and op.source = 'agreement';

  delete from org_product
   where org_edition_id = p_org_edition_id and source = 'agreement';

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into org_product (org_edition_id, product_sku, qty, unit_price_cents, status, source)
    values (p_org_edition_id, btrim(v_item->>'sku'),
            coalesce((v_item->>'qty')::numeric, 1), 0, 'booked', 'agreement');
    v_n := v_n + 1;
  end loop;

  perform log_audit('initiative.products', 'org_edition', p_org_edition_id::text,
                    coalesce(v_vorher, '[]'::jsonb), p_items);
  return v_n;
end $$;
