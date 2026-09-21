create or replace function shop_invoice_candidates(p_edition_id uuid)
 RETURNS TABLE(org_id uuid, legal_name text, communication_name text, address_street text, address_zip text, address_city text, address_country text, invoice_email text, invoice_name text, vat_id text, po_number text, sevdesk_contact_id text, order_ids uuid[], order_nos text[], positions jsonb, net_cents bigint, vat_cents bigint, gross_cents bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    with orders as (
      select o.id as ord_id, o.order_no as ord_no, oe.org_id as ord_org, o.po_number as ord_po
      from shop_order o join org_edition oe on oe.id = o.org_edition_id
      where o.status = 'completed' and oe.edition_id = p_edition_id
        and not exists (select 1 from external_ref x where x.system = 'sevdesk' and x.object_type = 'shop_order' and x.object_id = o.id)
    ),
    lines as (
      select ord.ord_org, sl.product_sku, max(sl.name_de) as line_name, max(sl.unit) as line_unit, sl.vat_rate as line_vat, sl.price_net_cents as line_price,
             sum(sl.qty) as line_qty, sum(round(sl.qty * sl.price_net_cents))::bigint as line_net
      from orders ord join shop_order_line sl on sl.order_id = ord.ord_id
      group by ord.ord_org, sl.product_sku, sl.vat_rate, sl.price_net_cents
    )
    select org.id, org.legal_name, org.communication_name, org.address_street, org.address_zip, org.address_city, org.address_country,
           oe.invoice_email::text, oe.invoice_name, oe.vat_id,
           coalesce((select string_agg(distinct ord.ord_po, ', ') from orders ord
                      where ord.ord_org = org.id and nullif(btrim(coalesce(ord.ord_po, '')), '') is not null),
                    oe.po_number),
           org.sevdesk_contact_id,
           (select array_agg(ord.ord_id order by ord.ord_no) from orders ord where ord.ord_org = org.id),
           (select array_agg(ord.ord_no order by ord.ord_no) from orders ord where ord.ord_org = org.id),
           (select coalesce(jsonb_agg(jsonb_build_object('sku', l.product_sku, 'name', l.line_name, 'unit', l.line_unit, 'qty', l.line_qty,
                                                          'price_net_cents', l.line_price, 'vat_rate', l.line_vat, 'net_cents', l.line_net) order by l.product_sku), '[]'::jsonb)
              from lines l where l.ord_org = org.id),
           (select coalesce(sum(l.line_net), 0)::bigint from lines l where l.ord_org = org.id),
           (select coalesce(sum(round(l.line_net * l.line_vat / 100)), 0)::bigint from lines l where l.ord_org = org.id),
           (select coalesce(sum(l.line_net) + sum(round(l.line_net * l.line_vat / 100)), 0)::bigint from lines l where l.ord_org = org.id)
    from organization org
    join org_edition oe on oe.org_id = org.id and oe.edition_id = p_edition_id
    where exists (select 1 from orders ord where ord.ord_org = org.id)
    order by coalesce(org.communication_name, org.legal_name);
end $$;
