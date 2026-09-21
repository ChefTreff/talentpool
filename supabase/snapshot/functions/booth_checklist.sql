create or replace function booth_checklist(p_edition_id uuid, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_edition_id uuid, org_id uuid, org_name text, booth_number text, product_sku text, product_name text, supplier text, qty numeric, checked boolean, checked_at timestamp with time zone, checked_by_name text, note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
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
      left join lateral (
        select b2.* from booth_assignment ba join booth b2 on b2.id = ba.booth_id
         where ba.org_edition_id = oe.id
         order by ba.event_day_id nulls first, b2.created_at limit 1) b on true
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
