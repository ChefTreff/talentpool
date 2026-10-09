create or replace function shop_quote_begin(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_o shop_order; v_org uuid; v_oe org_edition; v_co organization%rowtype; v_bad record; v_ref external_ref%rowtype;
  v_used integer := 0; v_tot record; v_hash text;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_o from shop_order where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  v_org := shop_order_org(p_order_id);
  if not partner_can_edit(v_org) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_o.status = 'quoted' then raise exception 'order_quoted' using errcode = 'P0001', detail = v_o.id::text; end if;
  if v_o.status <> 'draft' then raise exception 'not_editable' using errcode = 'P0001', detail = v_o.status; end if;
  select * into v_oe from org_edition where id = v_o.org_edition_id;
  if (shop_phase(v_oe.edition_id)->>'phase')::integer <> v_o.phase then raise exception 'phase_closed' using errcode = 'P0001', detail = 'order phase ' || v_o.phase::text; end if;
  if not exists (select 1 from shop_order_line where order_id = p_order_id) then raise exception 'empty_order' using errcode = '22023'; end if;

  select * into v_co from organization where id = v_org;
  -- K-81: der Abgleich mit SevDesk läuft über die Kundennummer (HubSpot company_id, ADM-057); ohne sie „Angebot beim Team anfragen“.
  if nullif(btrim(coalesce(v_co.customer_number, '')), '') is null then raise exception 'quote_customer_number_required' using errcode = 'P0001'; end if;
  -- K-81: Auslandspartner (andere Steuerregel) „beim Team anfragen“.
  if upper(btrim(coalesce(nullif(btrim(v_co.address_country), ''), 'DE'))) not in ('DE', 'DEUTSCHLAND', 'GERMANY') then
    raise exception 'quote_country_unsupported' using errcode = 'P0001', detail = coalesce(v_co.address_country, '-');
  end if;
  if nullif(btrim(coalesce(v_co.address_street, '')), '') is null or nullif(btrim(coalesce(v_co.address_zip, '')), '') is null
     or nullif(btrim(coalesce(v_co.address_city, '')), '') is null then
    raise exception 'quote_address_incomplete' using errcode = 'P0001';
  end if;
  -- Q5: höchstens drei Angebote je Bestellung (Schutz des Nummernkreises): das letzte plus die in meta.history.
  select * into v_ref from external_ref where system = 'sevdesk' and object_type = 'shop_quote' and object_id = p_order_id;
  if found then v_used := 1 + coalesce(jsonb_array_length(v_ref.meta->'history'), 0); end if;
  if v_used >= 3 then raise exception 'quote_limit_reached' using errcode = 'P0001', detail = v_used::text; end if;

  -- Merch (S4): jede Zeile mit Schema muss vollständig konfiguriert sein (wie bei der Bestellung).
  select l.product_sku as sku, merch_problem(p.merch_config, l.merch_config, l.qty) as problem
    into v_bad
    from shop_order_line l join product p on p.sku = l.product_sku
   where l.order_id = p_order_id
     and jsonb_array_length(merch_fields(p.merch_config)) > 0
     and merch_problem(p.merch_config, l.merch_config, l.qty) is not null
   order by l.created_at limit 1;
  if v_bad.sku is not null then
    raise exception 'merch_incomplete' using errcode = 'P0001', detail = v_bad.sku || ':' || v_bad.problem;
  end if;

  -- Festsetzen in einem Zug: Preise frisch aus dem Katalog, Bestand reservieren (Q1), Status.
  update shop_order_line l set price_net_cents = coalesce(p.net_price_cents, l.price_net_cents), vat_rate = p.vat_rate, name_de = p.name_de, name_en = p.name_en, unit = p.unit, category = p.category
    from product p where p.sku = l.product_sku and l.order_id = p_order_id;
  perform shop_reconcile_ledger(p_order_id, false);
  update shop_order set status = 'quoted', quote_started_at = now(), quote_valid_until = null where id = p_order_id;
  select * into v_tot from shop_order_totals(p_order_id);
  v_hash := shop_quote_lines_hash(p_order_id);
  perform log_audit('shop.quote_begin', 'shop_order', p_order_id::text, jsonb_build_object('status', v_o.status),
                    jsonb_build_object('order_no', v_o.order_no, 'net_cents', v_tot.net_cents, 'quotes_before', v_used));

  return jsonb_build_object(
    'order_id', p_order_id, 'order_no', v_o.order_no, 'phase', v_o.phase, 'po_number', v_o.po_number,
    'org', jsonb_build_object(
      'id', v_org, 'legal_name', v_co.legal_name, 'communication_name', v_co.communication_name, 'customer_number', btrim(v_co.customer_number),
      'sevdesk_contact_id', v_co.sevdesk_contact_id, 'address_street', v_co.address_street, 'address_zip', v_co.address_zip, 'address_city', v_co.address_city,
      'address_country', v_co.address_country, 'address_extra', v_co.address_extra,
      'vat_id', v_oe.vat_id, 'invoice_email', v_oe.invoice_email::text, 'invoice_name', v_oe.invoice_name),
    'lines', shop_order_lines_json(p_order_id),
    'totals', jsonb_build_object('net_cents', v_tot.net_cents, 'vat_cents', v_tot.vat_cents, 'gross_cents', v_tot.gross_cents),
    'lines_hash', v_hash, 'quotes_used', v_used);
end $$;
