-- =============================================================================
-- 0120 · Welle 6 · Produktstamm abgleichen: HubSpot und SevDesk (A4.3, PROD-006)
--
-- Liegt unter `vorschlag/`, bis die Architektur-Session sie anwendet.
--
-- Der Produktstamm entsteht heute im Portal. HubSpot braucht ihn für die
-- Angebotspositionen, SevDesk für die Rechnung — bisher tippt das jemand
-- zweimal ab, über ein Airtable-Formular und make.com. Dieser Baustein ersetzt
-- beides durch einen Knopf.
--
-- **Die Richtung ist fest: von hier nach dort, nie zurück.** Der Stamm hat
-- genau einen Eigentümer, und das ist das Portal. Ein Rücklauf würde bedeuten,
-- dass ein Preis an drei Stellen geändert werden kann und niemand mehr weiss,
-- welcher gilt.
--
-- **Was nicht hinausgeht:**
-- * `INI-%` — die Initiativen-Leistungen (0116) sind Barter und haben in einem
--   Vertriebs- oder Rechnungssystem nichts verloren.
-- * `source_hubspot = false` — reine Shop-Artikel gehören uns allein.
-- Beides zählt als „übersprungen" und nicht als Fehler; der Zähler sagt es.
--
-- **`external_ref` kann heute nur UUIDs.** `object_id` ist `uuid`, der
-- Produktschlüssel ist aber die SKU (`text`). Statt zwei Spalten an `product`
-- zu hängen und die Fremdschlüssel über die Datenbank zu verteilen, bekommt
-- `external_ref` ein `object_key text` für textgeschlüsselte Objekte. Genau
-- eines von beiden ist gesetzt, der CHECK erzwingt es.
--
-- Fehlerschlüssel: 42501 ohne Partner-Team (Liste) bzw. aus einem angemeldeten
-- Kontext (Rückschreiben) · 22023 `invalid_system` ·
-- P0002 `unknown_sku`.
--
-- Test: supabase/tests/v6_produktabgleich.sql
-- =============================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------- Fremdschlüssel

alter table external_ref add column if not exists object_key text;
alter table external_ref alter column object_id drop not null;
alter table external_ref drop constraint if exists external_ref_ziel_chk;
alter table external_ref add constraint external_ref_ziel_chk
  check ((object_id is null) <> (object_key is null));
create unique index if not exists external_ref_key_uidx
  on external_ref (system, object_type, object_key) where object_key is not null;
comment on column external_ref.object_key is
  'Fremdschluessel fuer textgeschluesselte Objekte, etwa product.sku (0120). Genau eines von object_id und object_key ist gesetzt.';

-- ---------------------------------------------------------------- Lesen

/**
 * Was hinausgeht, und was drüben schon bekannt ist.
 *
 * Liefert je Produkt den bekannten Fremdschlüssel gleich mit: ohne ihn müsste
 * der Abgleich für jede SKU erst drüben suchen, und beim zweiten Lauf noch
 * einmal. Ist er null, legt der Lauf an und meldet den neuen Schlüssel zurück.
 */
create or replace function products_for_sync(p_system text)
returns table (sku text, name_de text, name_en text, description_de text,
               category text, net_price_cents integer, vat_rate numeric,
               unit text, active boolean, external_id text)
language plpgsql stable security definer set search_path = public, extensions as $$
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
grant execute on function products_for_sync(text) to authenticated;

-- ---------------------------------------------------------------- Schreiben

/**
 * Den Fremdschlüssel merken, den das andere System vergeben hat.
 *
 * Idempotent: derselbe Lauf zweimal ergibt dieselbe Zeile. Das ist die
 * Grundlage dafür, dass ein zweiter Abgleich ändert statt anzulegen — ohne
 * diese Zeile entstünde drüben bei jedem Lauf ein neuer Artikel.
 *
 * **Nur im Serverkontext, und deshalb `auth.uid() is not null` statt einer
 * Rollenprüfung.** Gerufen wird sie vom Abgleich über den `service_role`-Client;
 * dort ist `auth.uid()` null, `has_role(…)` wäre damit false und eine
 * Rollenprüfung würde beim **ersten** Produkt mit 42501 abbrechen — ein Fehler,
 * den kein Test mit Nutzer-Claims findet, weil der Testblock als Eigentümer
 * läuft (Befund der Architektur-Session, 18.09.). Dasselbe Muster wie bei
 * `start_sync_job`, `record_sync_error` und `finish_sync_job`.
 *
 * Die Rolle prüfen deshalb die beiden Stellen davor: `requireArea("admin")` in
 * der Route und `products_for_sync` über den Nutzer-Client. Ohne die Liste gibt
 * es nichts zu schreiben.
 */
create or replace function set_product_external_ref(p_sku text, p_system text, p_external_id text)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_system not in ('hubspot', 'sevdesk') then
    raise exception 'invalid_system' using errcode = '22023', detail = coalesce(p_system, 'null');
  end if;
  if not exists (select 1 from product where sku = p_sku) then
    raise exception 'unknown_sku' using errcode = 'P0002', detail = coalesce(p_sku, 'null');
  end if;

  insert into external_ref (system, object_type, object_key, external_id)
  values (p_system, 'product', p_sku, p_external_id)
  on conflict (system, object_type, object_key) where object_key is not null
  do update set external_id = excluded.external_id, updated_at = now();
end $$;
revoke execute on function set_product_external_ref(text, text, text) from public, anon, authenticated;

-- Ein Recht für `authenticated` wäre die Erlaubnis, Fremdschlüssel frei zu
-- setzen — damit liesse sich der nächste Abgleich auf ein fremdes Objekt
-- umlenken. Der Riegel oben hält zusätzlich jeden angemeldeten Aufruf ab, auch
-- einen, dem jemand das Recht später wieder erteilt.

select harden_definer_functions();
