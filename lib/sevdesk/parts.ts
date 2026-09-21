import "server-only";
import { sd } from "@/lib/sevdesk/client";
import { SEVDESK_IDS } from "@/lib/sevdesk/mapping";
import type { ProductOut } from "@/lib/hubspot/products";

/**
 * Artikelstamm nach SevDesk.
 *
 * **Es wird nie gelöscht.** Auch nicht, wenn ein Produkt bei uns inaktiv wird:
 * an einem Artikel hängen drüben Belege, und ein gelöschter Artikel nimmt sie
 * mit oder macht sie unlesbar. Ein inaktives Produkt bekommt hier
 * `status = 50` („nicht mehr im Angebot"), die Zeile selbst bleibt stehen
 * (Vorgabe der Architektur-Session, 18.09.).
 */

type SdPart = { id: string; partNumber?: string | null };
type SdList<T> = { objects?: T };

/** SevDesk kennt 100 = aktiv und 50 = inaktiv. Gelöscht wird hier nichts. */
const STATUS_AKTIV = 100;
const STATUS_INAKTIV = 50;

function felder(p: ProductOut): Record<string, unknown> {
  return {
    name: p.name_de,
    partNumber: p.sku,
    // SevDesk führt Nettopreise als Dezimalzahl, wir als Cent.
    price: p.net_price_cents === null ? 0 : p.net_price_cents / 100,
    taxRate: Number(p.vat_rate),
    unity: { id: SEVDESK_IDS.unityPiece, objectName: "Unity" },
    // Ohne Bestandsführung: der Artikelstamm dient der Rechnung, nicht dem Lager.
    stock: 0,
    status: p.active ? STATUS_AKTIV : STATUS_INAKTIV,
    text: p.description_de ?? "",
  };
}

/**
 * Anlegen oder ändern.
 *
 * Wie bei HubSpot: kennen wir den Fremdschlüssel nicht, suchen wir einmal über
 * die Artikelnummer, bevor wir anlegen. Sonst entstünde bei jedem Lauf ein
 * neuer Artikel mit derselben Nummer.
 */
export async function upsertSevdeskPart(
  p: ProductOut,
  bekannt: string | null,
): Promise<{ id: string; angelegt: boolean }> {
  if (bekannt) {
    await sd(`/Part/${bekannt}`, { method: "PUT", body: JSON.stringify(felder(p)) });
    return { id: bekannt, angelegt: false };
  }

  const suche = await sd<SdList<SdPart[]>>(
    `/Part?partNumber=${encodeURIComponent(p.sku)}&limit=1`,
  );
  const gefunden = suche.objects?.[0]?.id;
  if (gefunden) {
    await sd(`/Part/${gefunden}`, { method: "PUT", body: JSON.stringify(felder(p)) });
    return { id: gefunden, angelegt: false };
  }

  const neu = await sd<SdList<SdPart[]> & Partial<SdPart>>("/Part", {
    method: "POST",
    body: JSON.stringify(felder(p)),
  });
  // SevDesk antwortet mal als Objekt, mal als Liste mit einem Eintrag.
  const id = neu.objects?.[0]?.id ?? neu.id;
  if (!id) throw new Error(`SevDesk hat keine Artikel-Id zurückgegeben (${p.sku})`);
  return { id, angelegt: true };
}
