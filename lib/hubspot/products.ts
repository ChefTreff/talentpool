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

/** Ein Produkt, wie HubSpot es führt — für die Altbestandsliste. */
export type HubspotProductRow = { id: string; name: string; sku: string | null; price: string | null; createdAt: string | null };

/**
 * Alle Produkte lesen — **nur lesend**, blättert durch.
 *
 * Gebraucht für den Altbestand: Produkte **ohne** `hs_sku` findet der Abgleich
 * nicht, also legt er unsere Artikel daneben neu an. Sie sind der Grund, warum
 * HubSpot nach einem Lauf zwei Generationen desselben Katalogs hielte.
 */
export async function listHubspotProducts(): Promise<HubspotProductRow[]> {
  const out: HubspotProductRow[] = [];
  let after: string | null = null;
  for (let seite = 0; seite < 50; seite++) {
    const pfad = `/crm/v3/objects/products?limit=100&properties=hs_sku,name,price,createdate${after ? `&after=${after}` : ""}`;
    const seiteJson: { results?: HsProduct[]; paging?: { next?: { after?: string } } } = await hs(pfad);
    for (const p of seiteJson.results ?? []) {
      out.push({
        id: p.id,
        name: (p.properties?.name ?? "").trim(),
        sku: (p.properties?.hs_sku ?? "").trim() || null,
        price: p.properties?.price ?? null,
        createdAt: p.properties?.createdate ?? null,
      });
    }
    after = seiteJson.paging?.next?.after ?? null;
    if (!after) break;
  }
  return out;
}

/**
 * Produkte **archivieren**, nicht löschen.
 *
 * HubSpot kennt kein Hartlöschen über die API: `batch/archive` legt die Zeilen in
 * den Papierkorb, aus dem sie 90 Tage lang zurückgeholt werden können. Das ist
 * dasselbe „deaktivieren statt löschen", das für alle Alt-Systeme gilt. Angebote
 * und Deals, an denen ein archiviertes Produkt hängt, behalten ihre Positionen.
 */
export async function archiveHubspotProducts(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 100) {
    await hs("/crm/v3/objects/products/batch/archive", {
      method: "POST",
      body: JSON.stringify({ inputs: ids.slice(i, i + 100).map((id) => ({ id })) }),
    });
  }
}

/** Die SKU drüben suchen — **nur lesend**. Grundlage des Dublettenschutzes und des Trockenlaufs. */
export async function findHubspotProduct(sku: string): Promise<string | null> {
  const suche = await hs<{ results?: HsProduct[] }>("/crm/v3/objects/products/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "hs_sku", operator: "EQ", value: sku }] }],
      properties: ["hs_sku"],
      limit: 1,
    }),
  });
  return suche.results?.[0]?.id ?? null;
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

  const gefunden = await findHubspotProduct(p.sku);
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
