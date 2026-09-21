create or replace function shop_catalogue(p_org_id uuid, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(sku text, name_de text, name_en text, description_de text, description_en text, category text, unit text, net_price_cents integer, vat_rate numeric, images jsonb, shop_hint_de text, shop_hint_en text, merch_config jsonb, late_orderable boolean, available_until timestamp with time zone, stock_available integer, track_stock boolean, request_only boolean, orderable boolean, shop_sort integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_oe org_edition; v_phase jsonb; v_p integer; v_late boolean;
begin
  if not (is_partner_of(p_org_id) or is_partner_team()) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then return; end if;
  if not (org_has_booth(v_oe.id) or is_partner_team()) then return; end if;
  v_phase := shop_phase(v_oe.edition_id); v_p := (v_phase->>'phase')::integer; v_late := (v_phase->>'late_only')::boolean;
  return query
    select p.sku, p.name_de, p.name_en, p.description_de, p.description_en, p.category, p.unit, p.net_price_cents, p.vat_rate, p.images, p.shop_hint_de, p.shop_hint_en,
           p.merch_config, p.late_orderable, p.available_until, shop_stock_available(p.sku), p.track_stock,
           (coalesce(p.net_price_cents, 0) = 0),
           (v_p > 0 and coalesce(p.net_price_cents, 0) > 0 and (not v_late or p.late_orderable) and (p.available_until is null or p.available_until > now())
            and (not p.track_stock or coalesce(shop_stock_available(p.sku), 0) > 0)),
           p.shop_sort
    from product p
    where p.active and p.shop_visible and (p.edition_id is null or p.edition_id = v_oe.edition_id)
    order by p.shop_sort nulls last, p.category, p.name_de;
end $$;
