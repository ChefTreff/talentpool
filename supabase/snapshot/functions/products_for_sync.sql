create or replace function products_for_sync(p_system text)
 RETURNS TABLE(sku text, name_de text, name_en text, description_de text, category text, net_price_cents integer, vat_rate numeric, unit text, active boolean, external_id text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if not is_partner_team() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_system not in ('hubspot', 'sevdesk') then
    raise exception 'invalid_system' using errcode = '22023', detail = coalesce(p_system, 'null');
  end if;
  return query
    select p.sku, p.name_de, p.name_en, p.description_de, p.category,
           p.net_price_cents, p.vat_rate, p.unit, p.active,
           (select e.external_id from external_ref e
             where e.system = p_system and e.object_type = 'product' and e.object_key = p.sku)
      from product p
     -- Barter und reine Shop-Artikel bleiben hier (siehe Kopf).
     where p.sku not like 'INI-%' and p.source_hubspot
     order by p.sku;
end $$;
