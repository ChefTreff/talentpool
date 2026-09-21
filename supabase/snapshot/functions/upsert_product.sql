create or replace function upsert_product(p_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sku text := p_data->>'sku'; v_exists boolean;
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Zweites Muster fuer Initiativen-Leistungen (siehe `product_sku_check` oben).
  -- Ohne diese Zeile waeren die vier INI-Produkte nur im Studio pflegbar — und
  -- „mal eben im Dashboard“ ist genau das, was die Konventionen verbieten
  -- (Auflage der Architektur-Session, 18.09.).
  if v_sku is null or (v_sku !~ '^I-[0-9]{5}$' and v_sku !~ '^INI-[A-Z0-9-]{3,20}$') then
    raise exception 'invalid_sku' using errcode = '22023';
  end if;
  if p_data ? 'category' and not is_vocab_key('product_category', p_data->>'category') then raise exception 'invalid_category' using errcode = '22023'; end if;
  -- Neu (0110): welche Partner-Seite dieses Produkt oeffnet. Leerer Text heisst
  -- „keine Seite" — sonst liesse sich eine Zuordnung ueber die Oberflaeche nie
  -- wieder entfernen.
  if p_data ? 'format_key' and nullif(btrim(p_data->>'format_key'), '') is not null
     and not is_vocab_key('partner_format', btrim(p_data->>'format_key')) then
    raise exception 'invalid_format' using errcode = '22023', detail = coalesce(p_data->>'format_key', 'null');
  end if;
  if p_data ? 'pass_type' and nullif(p_data->>'pass_type', '') is not null and (p_data->>'pass_type') not in ('partner', 'talent', 'investor') then raise exception 'invalid_pass_type' using errcode = '22023'; end if;
  if p_data ? 'grants_role' and nullif(p_data->>'grants_role', '') is not null and not is_vocab_key('role', p_data->>'grants_role') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select exists (select 1 from product where sku = v_sku) into v_exists;
  if not v_exists then
    insert into product (sku, name_de, name_en, description_de, description_en, type, category, unit, net_price_cents, purchase_price_cents, margin, vat_rate,
                         supplier, supplier_sku, supplier_url, stock_total, track_stock, available_until, shop_visible, shop_sort, late_orderable,
                         shop_hint_de, shop_hint_en, purchase_note_de, purchase_note_en, merch_config, images, source_hubspot, source_shop, internal_comment, active, edition_id,
                         pass_type, grants_role, format_key)
    values (v_sku, p_data->>'name_de', p_data->>'name_en', p_data->>'description_de', p_data->>'description_en', coalesce(p_data->>'type', 'shop_item'), p_data->>'category',
            coalesce(p_data->>'unit', 'piece'), (p_data->>'net_price_cents')::integer, (p_data->>'purchase_price_cents')::integer, (p_data->>'margin')::numeric,
            coalesce((p_data->>'vat_rate')::numeric, 7), p_data->>'supplier', p_data->>'supplier_sku', p_data->>'supplier_url', (p_data->>'stock_total')::integer,
            coalesce((p_data->>'track_stock')::boolean, false), (p_data->>'available_until')::timestamptz, coalesce((p_data->>'shop_visible')::boolean, false),
            (p_data->>'shop_sort')::integer, coalesce((p_data->>'late_orderable')::boolean, false), p_data->>'shop_hint_de', p_data->>'shop_hint_en',
            p_data->>'purchase_note_de', p_data->>'purchase_note_en', p_data->'merch_config', coalesce(p_data->'images', '[]'::jsonb),
            coalesce((p_data->>'source_hubspot')::boolean, false), coalesce((p_data->>'source_shop')::boolean, false), p_data->>'internal_comment',
            coalesce((p_data->>'active')::boolean, true), (p_data->>'edition_id')::uuid,
            nullif(p_data->>'pass_type', ''), nullif(p_data->>'grants_role', ''), nullif(btrim(p_data->>'format_key'), ''));
  else
    update product set
      name_de = case when p_data ? 'name_de' then p_data->>'name_de' else name_de end,
      name_en = case when p_data ? 'name_en' then nullif(p_data->>'name_en', '') else name_en end,
      description_de = case when p_data ? 'description_de' then nullif(p_data->>'description_de', '') else description_de end,
      description_en = case when p_data ? 'description_en' then nullif(p_data->>'description_en', '') else description_en end,
      type = case when p_data ? 'type' then p_data->>'type' else type end,
      category = case when p_data ? 'category' then p_data->>'category' else category end,
      unit = case when p_data ? 'unit' then p_data->>'unit' else unit end,
      net_price_cents = case when p_data ? 'net_price_cents' then (p_data->>'net_price_cents')::integer else net_price_cents end,
      purchase_price_cents = case when p_data ? 'purchase_price_cents' then (p_data->>'purchase_price_cents')::integer else purchase_price_cents end,
      margin = case when p_data ? 'margin' then (p_data->>'margin')::numeric else margin end,
      vat_rate = case when p_data ? 'vat_rate' then (p_data->>'vat_rate')::numeric else vat_rate end,
      supplier = case when p_data ? 'supplier' then nullif(p_data->>'supplier', '') else supplier end,
      supplier_sku = case when p_data ? 'supplier_sku' then nullif(p_data->>'supplier_sku', '') else supplier_sku end,
      supplier_url = case when p_data ? 'supplier_url' then nullif(p_data->>'supplier_url', '') else supplier_url end,
      stock_total = case when p_data ? 'stock_total' then (p_data->>'stock_total')::integer else stock_total end,
      track_stock = case when p_data ? 'track_stock' then (p_data->>'track_stock')::boolean else track_stock end,
      available_until = case when p_data ? 'available_until' then (p_data->>'available_until')::timestamptz else available_until end,
      shop_visible = case when p_data ? 'shop_visible' then (p_data->>'shop_visible')::boolean else shop_visible end,
      shop_sort = case when p_data ? 'shop_sort' then (p_data->>'shop_sort')::integer else shop_sort end,
      late_orderable = case when p_data ? 'late_orderable' then (p_data->>'late_orderable')::boolean else late_orderable end,
      shop_hint_de = case when p_data ? 'shop_hint_de' then nullif(p_data->>'shop_hint_de', '') else shop_hint_de end,
      shop_hint_en = case when p_data ? 'shop_hint_en' then nullif(p_data->>'shop_hint_en', '') else shop_hint_en end,
      purchase_note_de = case when p_data ? 'purchase_note_de' then nullif(p_data->>'purchase_note_de', '') else purchase_note_de end,
      purchase_note_en = case when p_data ? 'purchase_note_en' then nullif(p_data->>'purchase_note_en', '') else purchase_note_en end,
      merch_config = case when p_data ? 'merch_config' then p_data->'merch_config' else merch_config end,
      images = case when p_data ? 'images' then p_data->'images' else images end,
      internal_comment = case when p_data ? 'internal_comment' then nullif(p_data->>'internal_comment', '') else internal_comment end,
      active = case when p_data ? 'active' then (p_data->>'active')::boolean else active end,
      pass_type = case when p_data ? 'pass_type' then nullif(p_data->>'pass_type', '') else pass_type end,
      grants_role = case when p_data ? 'grants_role' then nullif(p_data->>'grants_role', '') else grants_role end,
      format_key = case when p_data ? 'format_key' then nullif(btrim(p_data->>'format_key'), '') else format_key end
    where sku = v_sku;
  end if;
  perform log_audit('product.upsert', 'product', v_sku, null, p_data - 'description_de' - 'description_en');
  return v_sku;
end $$;
