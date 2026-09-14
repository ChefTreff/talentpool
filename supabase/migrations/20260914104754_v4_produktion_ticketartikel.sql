-- 0087 · Welle 4 · Produktion: Ticket-Kontingente gehören nicht auf die Stand-Checkliste
--
-- Befund aus dem Walkthrough am 14.09.2026: Auf der Stand-Checkliste standen
-- neben Mobiliar und Technik auch die Ticket-Kontingente eines Partners
-- ("Talent Pass", "Partner Pass"). Die beiden Filter in 0082 fragen
-- `p.type in ('shop_item', 'addon')` — und die Ticket-Kontingente sind im
-- Katalog als `addon` geführt:
--
--     type   | category | pass_type
--     addon  | tickets  | partner
--     addon  | tickets  | talent
--
-- Für die Produktion ist das falsch und nicht bloß unschön: niemand liefert
-- ein Kontingent an den Stand und hakt es ab, und in der Bestellliste je
-- Dienstleister wären Tickets eine Position ohne Lieferanten, die den
-- Einkaufspreis der Edition verfälscht. Kontingente laufen über vivenu
-- (`ticket_allocation`), nicht über die Standlogistik.
--
-- Der Typ allein trägt die Unterscheidung also nicht. Geprüft wird ab jetzt
-- beides: die Kategorie `tickets` **und** ein gesetzter `pass_type`. Heute
-- fallen beide Merkmale zusammen; getrennt geprüft bleibt der Filter auch
-- dicht, wenn später ein Ticketartikel nur eines von beiden trägt.
--
-- Rechte, Fehlerschlüssel und Signaturen bleiben unverändert — nur die
-- WHERE-Klausel kommt dazu. Test unten.
set search_path = public, extensions;

-- ---------------------------------------------------------------- Checkliste

create or replace function booth_checklist(p_edition_id uuid, p_org_id uuid default null)
returns table(
  org_edition_id uuid, org_id uuid, org_name text, booth_number text,
  product_sku text, product_name text, supplier text, qty numeric,
  checked boolean, checked_at timestamptz, checked_by_name text, note text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_production_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select oe.id, o.id, coalesce(o.communication_name, o.legal_name), b.booth_number,
           p.sku, coalesce(p.name_de, p.name_en), p.supplier, op.qty,
           c.id is not null, c.checked_at,
           coalesce(pe.first_name || ' ' || pe.last_name, null), c.note
      from org_edition oe
      join organization o on o.id = oe.org_id
      join org_product op on op.org_edition_id = oe.id
      join product p on p.sku = op.product_sku
      left join booth b on b.org_edition_id = oe.id
      left join booth_service_check c on c.org_edition_id = oe.id and c.product_sku = p.sku
      left join person pe on pe.id = c.checked_by
     where oe.edition_id = p_edition_id
       and (p_org_id is null or o.id = p_org_id)
       and op.status <> 'cancelled'
       -- Was am Stand ankommt: Messeshop-Artikel und Add-ons. `package` ist
       -- das Sponsoring-Paket selbst, keine Lieferung zum Abhaken.
       and p.type in ('shop_item', 'addon')
       -- Ticket-Kontingente sind keine Lieferung. Sie laufen über vivenu.
       and coalesce(p.category, '') <> 'tickets'
       and p.pass_type is null
     order by coalesce(o.communication_name, o.legal_name), p.supplier, p.sku;
end $$;

-- ---------------------------------------------------------------- Bestellliste

create or replace function supplier_order_list(p_edition_id uuid, p_supplier text default null)
returns table(supplier text, product_sku text, product_name text, unit text,
              qty numeric, orgs integer, purchase_price_cents integer)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_production_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select coalesce(p.supplier, ''), p.sku, coalesce(p.name_de, p.name_en), p.unit,
           sum(op.qty), count(distinct oe.org_id)::integer, p.purchase_price_cents
      from org_edition oe
      join org_product op on op.org_edition_id = oe.id
      join product p on p.sku = op.product_sku
     where oe.edition_id = p_edition_id
       and op.status <> 'cancelled'
       and p.type in ('shop_item', 'addon')
       and coalesce(p.category, '') <> 'tickets'
       and p.pass_type is null
       and (p_supplier is null or p.supplier = p_supplier)
     group by p.supplier, p.sku, p.name_de, p.name_en, p.unit, p.purchase_price_cents
     order by coalesce(p.supplier, ''), p.sku;
end $$;

select harden_definer_functions();
