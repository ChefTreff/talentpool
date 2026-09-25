-- Vorschlag · Welle 6 · Standpakete: Standardausstattung der Eigenproduktions-Stände, „Agency Area Partner“
-- stillgelegt, Standliste ohne Initiativen-Stände (PART-085, PART-086): product_component, product, booth_packages
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: Konrads Klickrunde Partner (25.09.):
--   PART-085 „Stand ein Tag“ und „Stand zwei Tage“ nie in der Liste der Standpakete;
--   PART-086 Eigenproduktion Stand – General (9 qm) und – Premium (18 qm): nur Strom und Teppich, dazu
--            Standbeleuchtung, alles Weitere bringt der Partner mit; „Agency Area Partner (General)“ kommt raus.
--
-- **Stammdaten ohne Personenbezug** — dürfen vor der Altdaten-Migration eingespielt werden (AGENTS.md).
-- Die Stückliste (`product_component`) ist dieselbe Liste, aus der die Produktion bestellt; die Messestand-Seite
-- zeigt sie nur. Mengen wie bei den All-Inclusive-Ständen gleicher Fläche: ein Stromanschluss 230V
-- (I-76440), Teppich in Quadratmetern der Fläche (I-73593), eine Standbeleuchtung (I-62157).
-- „Agency Area Partner“ (I-40175) wird **deaktiviert, nicht gelöscht** (nie löschen, AGENTS.md) — am 25.09.
-- führte ihn keine Organisation. `booth_packages` wortgleich aus dem Snapshot, eingefügt ist nur der Filter
-- auf `format_key`: die beiden Initiativen-Stände (`INI-STAND-1T`, `INI-STAND-2T`) tragen keinen.
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) Stückliste der Eigenproduktion (PART-086)
insert into product_component (bundle_sku, component_sku, qty) values
  ('I-84869', 'I-76440', 1), ('I-84869', 'I-73593', 9),  ('I-84869', 'I-62157', 1),
  ('I-36848', 'I-76440', 1), ('I-36848', 'I-73593', 18), ('I-36848', 'I-62157', 1)
on conflict (bundle_sku, component_sku) do update set qty = excluded.qty;

-- ---------------------------------------------------------------- 2) „Agency Area Partner“ stillgelegt (PART-086)
update product set active = false where sku = 'I-40175' and active;

-- ---------------------------------------------------------------- 3) Standliste nur mit Ständen (PART-085)
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
       -- PART-085: nur Stände, an denen die Messestand-Seite hängt — „Stand, ein Tag“ und
       -- „Stand, beide Tage“ der Initiativen (0116, ohne format_key) nie in dieser Liste.
       and p.format_key in ('booth', 'stage')
     order by p.area_sqm nulls last, p.name_de;
end $$;

select harden_definer_functions();
