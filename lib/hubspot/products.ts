import "server-only";
import { hs } from "@/lib/hubspot/client";

/**
 * Produktstamm nach HubSpot — **nur hinaus, nie zurück.**
 *
 * Der Stamm hat genau einen Eigentümer, und das ist das Portal. Diese Datei
 * kennt deshalb kein Lesen zum Übernehmen; sie legt an und ändert.
 */

type HsProduct = { id: string; properties: Record<string, string | null> };

/** Was HubSpot an einem Produkt führt. Preise dort sind Euro als Text. */
export type ProductOut = {
  sku: string;
  name_de: string;
  name_en: string | null;
  description_de: string | null;
  category: string | null;
  net_price_cents: number | null;
  vat_rate: number;
  unit: string;
  active: boolean;
};

function felder(p: ProductOut): Record<string, string> {
  return {
    name: p.name_de,
    hs_sku: p.sku,
    // HubSpot rechnet in Euro, wir in Cent. Ohne diese Zeile stünde dort das
    // Hundertfache, und niemand sähe es dem Angebot an.
    price: p.net_price_cents === null ? "" : (p.net_price_cents / 100).toFixed(2),
    description: p.description_de ?? "",
    hs_product_type: p.category ?? "",
  };
}

/**
 * Anlegen oder ändern, je nachdem, ob wir den Fremdschlüssel schon kennen.
 *
 * Kennen wir ihn nicht, suchen wir **einmal** über die SKU: ein Produkt, das
 * jemand drüben von Hand angelegt hat, soll nicht ein zweites Mal entstehen.
 * Findet die Suche nichts, wird angelegt.
 */
export async function upsertHubspotProduct(
  p: ProductOut,
  bekannt: string | null,
): Promise<{ id: string; angelegt: boolean }> {
  if (bekannt) {
    await hs(`/crm/v3/objects/products/${bekannt}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: felder(p) }),
    });
    return { id: bekannt, angelegt: false };
  }

  const suche = await hs<{ results?: HsProduct[] }>("/crm/v3/objects/products/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "hs_sku", operator: "EQ", value: p.sku }] }],
      properties: ["hs_sku"],
      limit: 1,
    }),
  });
  const gefunden = suche.results?.[0]?.id;
  if (gefunden) {
    await hs(`/crm/v3/objects/products/${gefunden}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: felder(p) }),
    });
    return { id: gefunden, angelegt: false };
  }

  const neu = await hs<HsProduct>("/crm/v3/objects/products", {
    method: "POST",
    body: JSON.stringify({ properties: felder(p) }),
  });
  return { id: neu.id, angelegt: true };
}
