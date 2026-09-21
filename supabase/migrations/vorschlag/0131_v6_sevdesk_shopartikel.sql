-- =============================================================================
-- 0131 · Welle 6 · Messeshop-Artikel gehen nach SevDesk (Nachtrag zu A4.3)
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- 0120 schickte in **beide** Systeme dieselbe Menge: 86 Artikel mit
-- `source_hubspot`, die übrigen 76 blieben hier. Für HubSpot ist das richtig —
-- ein Mobiliar-Artikel aus dem Messeshop hat im Vertriebssystem nichts zu
-- suchen. Für SevDesk ist es falsch: **dort soll der Artikelstamm vollständig
-- sein**, damit sich eine Rechnung am Ende einem Artikel zuordnen lässt
-- (Konrad, 21.09.: „Das macht es einfacher, das am Ende nachzuvollziehen.").
--
-- Die Regel ist damit **je System verschieden**, und genau so war sie im Review
-- zu 0120 als Folgeaufgabe vorgemerkt.
--
-- | System | was hinausgeht |
-- |---|---|
-- | HubSpot | `source_hubspot`, ohne `INI-%` — 86 Artikel |
-- | SevDesk | alles ohne `INI-%` — 162 Artikel, davon 76 neu |
--
-- **Barter bleibt in beiden Fällen hier.** `INI-%` sind Leistungen aus einer
-- Vereinbarung mit Preis 0; in einem Rechnungssystem wären sie eine Einladung,
-- sie versehentlich zu berechnen.
--
-- Inaktive Artikel gehen mit: `lib/sevdesk/parts.ts` setzt drüben das
-- Inaktiv-Kennzeichen, statt sie wegzulassen. Ein Artikel, der bei uns
-- ausläuft und drüben unbekannt bleibt, taucht auf keiner alten Rechnung auf.
--
-- **Grundlage ist die Live-Fassung** aus `supabase/snapshot/functions/`; neu ist
-- allein die Bedingung in der Auswahl.
--
-- Fehlerschlüssel: unverändert — 42501 ohne Partner-Team · 22023 `invalid_system`.
--
-- Test: supabase/tests/v6_sevdesk_shopartikel.sql
-- =============================================================================
set search_path = public, extensions;

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
     -- Barter bleibt hier. Shop-Artikel gehen nach SevDesk, aber nicht nach
     -- HubSpot (siehe Kopf).
     where p.sku not like 'INI-%'
       and (p_system = 'sevdesk' or p.source_hubspot)
     order by p.sku;
end $$;

select harden_definer_functions();
