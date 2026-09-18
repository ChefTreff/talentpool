create or replace function booth_packages()
 RETURNS TABLE(sku text, name_de text, name_en text, description_de text, description_en text, area_sqm numeric, size_note text, net_price_cents integer, components jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Die Liste trägt Paketpreise. Talente und Volunteers brauchen sie nicht,
  -- und die Messestand-Seite liegt im Partner-Portal (Review 15.09.).
  if not (my_kb_audiences() && array['partner']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select p.sku, p.name_de, p.name_en, p.description_de, p.description_en,
           p.area_sqm, p.size_note, p.net_price_cents,
           coalesce((select jsonb_agg(jsonb_build_object(
                              'sku', c.component_sku, 'qty', c.qty,
                              'unit', cp.unit,
                              'name_de', cp.name_de, 'name_en', cp.name_en)
                            order by cp.name_de)
                       from product_component c join product cp on cp.sku = c.component_sku
                      where c.bundle_sku = p.sku), '[]'::jsonb)
      from product p
     where p.type = 'package' and p.category = 'standflaeche' and p.active
     order by p.area_sqm nulls last, p.name_de;
end $$;
