-- 0052 · Welle 3 A10: SevDesk-Rechnungsentwürfe aus abgeschlossenen Shop-Bestellungen. Die Datenbank liefert je Org × Edition die Kandidaten (alle
-- `completed`-Bestellungen ohne SevDesk-Referenz, Positionen je SKU/Preis/USt zusammengefasst, Rechnungsdaten aus organization/org_edition) und merkt
-- sich je Bestellung die Referenz in external_ref (system sevdesk, object_type shop_order) — dadurch legt ein zweiter Lauf nichts doppelt an.
-- Auslösen tut das Team im Admin (Antwort 41), der SevDesk-Aufruf selbst liegt in lib/sevdesk. Nebenbei: pauschale Grants auf external_ref aus Welle 1 entzogen.
set search_path = public, extensions;

revoke all on external_ref from anon, authenticated;

create or replace function shop_invoice_candidates(p_edition_id uuid)
returns table (org_id uuid, legal_name text, communication_name text, address_street text, address_zip text, address_city text, address_country text,
               invoice_email text, invoice_name text, vat_id text, po_number text, sevdesk_contact_id text,
               order_ids uuid[], order_nos text[], positions jsonb, net_cents bigint, vat_cents bigint, gross_cents bigint)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    with orders as (
      select o.id as ord_id, o.order_no as ord_no, oe.org_id as ord_org
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
           oe.invoice_email::text, oe.invoice_name, oe.vat_id, oe.po_number, org.sevdesk_contact_id,
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

-- Referenz je Bestellung (Idempotenz); dieselbe Rechnung deckt mehrere Bestellungen ⇒ external_id = <Rechnung>#<Bestellnummer>
create or replace function record_shop_invoice(p_org_id uuid, p_order_ids uuid[], p_sevdesk_invoice_id text, p_sevdesk_contact_id text default null, p_meta jsonb default null) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare v_n integer := 0; v_id uuid; v_no text;
begin
  if not (auth.uid() is null or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_sevdesk_invoice_id, '')), '') is null then raise exception 'invoice_id_required' using errcode = '22023'; end if;
  if p_order_ids is null or cardinality(p_order_ids) = 0 then raise exception 'orders_required' using errcode = '22023'; end if;
  foreach v_id in array p_order_ids loop
    select o.order_no into v_no from shop_order o join org_edition oe on oe.id = o.org_edition_id where o.id = v_id and oe.org_id = p_org_id and o.status = 'completed';
    if not found then raise exception 'order_not_completed' using errcode = 'P0001', detail = v_id::text; end if;
    insert into external_ref (system, object_type, object_id, external_id, meta)
    values ('sevdesk', 'shop_order', v_id, btrim(p_sevdesk_invoice_id) || '#' || v_no,
            coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('invoice_id', btrim(p_sevdesk_invoice_id), 'contact_id', p_sevdesk_contact_id, 'order_no', v_no))
    on conflict (system, object_type, object_id) do nothing;
    v_n := v_n + 1;
  end loop;
  if nullif(btrim(coalesce(p_sevdesk_contact_id, '')), '') is not null then
    update organization set sevdesk_contact_id = coalesce(sevdesk_contact_id, btrim(p_sevdesk_contact_id)) where id = p_org_id;
  end if;
  perform log_audit('shop.invoice_draft', 'organization', p_org_id::text, null, jsonb_build_object('invoice_id', p_sevdesk_invoice_id, 'orders', cardinality(p_order_ids)));
  return v_n;
end $$;

create or replace function set_org_sevdesk_contact(p_org_id uuid, p_contact_id text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (auth.uid() is null or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  update organization set sevdesk_contact_id = nullif(btrim(coalesce(p_contact_id, '')), '') where id = p_org_id;
  if not found then raise exception 'org_not_found' using errcode = 'P0002'; end if;
  perform log_audit('org.sevdesk_contact', 'organization', p_org_id::text, null, jsonb_build_object('contact_id', p_contact_id));
end $$;

create or replace function shop_invoice_refs(p_edition_id uuid)
returns table (org_id uuid, org_name text, order_id uuid, order_no text, sevdesk_invoice_id text, sevdesk_contact_id text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select oe.org_id, coalesce(org.communication_name, org.legal_name), o.id, o.order_no, x.meta->>'invoice_id', x.meta->>'contact_id', x.created_at
    from external_ref x
    join shop_order o on o.id = x.object_id
    join org_edition oe on oe.id = o.org_edition_id
    join organization org on org.id = oe.org_id
    where x.system = 'sevdesk' and x.object_type = 'shop_order' and oe.edition_id = p_edition_id
    order by x.created_at desc;
end $$;

select harden_definer_functions();
