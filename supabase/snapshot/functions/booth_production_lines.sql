create or replace function booth_production_lines(p_edition_id uuid, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_edition_id uuid, org_id uuid, product_sku text, qty_package numeric, qty_offer numeric, qty_shop numeric, qty_shop_open numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  with src as (
    -- Angebot: direkt gebuchte Leistungen
    select oe.id as oe_id, oe.org_id as o_id, op.product_sku as sku, 'offer'::text as kind,
           op.qty as qty, 0::numeric as open_qty
      from org_edition oe
      join org_product op on op.org_edition_id = oe.id and op.status <> 'cancelled'
     where oe.edition_id = p_edition_id and (p_org_id is null or oe.org_id = p_org_id)
    union all
    -- Standardausstattung: Stückliste jedes gebuchten Pakets × Menge des Pakets
    select oe.id, oe.org_id, pc.component_sku, 'package', op.qty * pc.qty, 0::numeric
      from org_edition oe
      join org_product op on op.org_edition_id = oe.id and op.status <> 'cancelled'
      join product_component pc on pc.bundle_sku = op.product_sku
     where oe.edition_id = p_edition_id and (p_org_id is null or oe.org_id = p_org_id)
    union all
    -- Messeshop: bestätigte Bestellungen; `open_qty` ist der Teil, der sich bis zur Frist noch ändern kann
    select oe.id, oe.org_id, sl.product_sku, 'shop', sl.qty,
           case when so.status in ('pending', 'editing') then sl.qty else 0::numeric end
      from org_edition oe
      join shop_order so on so.org_edition_id = oe.id and so.status in ('pending', 'editing', 'completed')
      join shop_order_line sl on sl.order_id = so.id
     where oe.edition_id = p_edition_id and (p_org_id is null or oe.org_id = p_org_id)
  )
  select s.oe_id, s.o_id, s.sku,
         coalesce(sum(s.qty) filter (where s.kind = 'package'), 0),
         coalesce(sum(s.qty) filter (where s.kind = 'offer'), 0),
         coalesce(sum(s.qty) filter (where s.kind = 'shop'), 0),
         coalesce(sum(s.open_qty) filter (where s.kind = 'shop'), 0)
    from src s
    join product p on p.sku = s.sku
   -- Was am Stand ankommt: Messeshop-Artikel und Add-ons. `package` ist das Sponsoring-Paket selbst, keine
   -- Lieferung. Ticket-Kontingente und Pässe laufen über vivenu.
   where p.type in ('shop_item', 'addon')
     and coalesce(p.category, '') <> 'tickets'
     and p.pass_type is null
   group by s.oe_id, s.o_id, s.sku
$$;
