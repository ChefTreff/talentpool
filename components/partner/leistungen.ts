/**
 * Gebuchte Leistungen je SKU zusammengefasst (PART-100/PART-102, Konrad & Leopold 05.10.). `partner_overview.products[]` führt **eine Zeile je
 * Buchung**: kommt eine Leistung später über einen zweiten Deal dazu (Nachbuchung, K-82), steht dieselbe SKU zweimal da — mit `nachgebucht_am` an
 * der späteren Zeile. Die Liste im Portal und die Karte „Gebucht“ im Admin zeigen **einen Eintrag je Leistung** mit der Summe der Menge und
 * nennen den Nachbuchungs-Anteil: „× 10 · davon 2 nachgebucht am 12.10.2026“; eine ganz nachgebuchte Leistung: „nachgebucht am 12.10.2026“.
 *
 * Nur **gebuchte** Zeilen zählen; eine stornierte (`status = 'cancelled'`) ist keine Leistung mehr — hat eine SKU nur stornierte Zeilen, steht sie
 * als `storniert` da (das Portal lässt sie weg, der Admin zeigt sie mit ihrem Stand). Die Reihenfolge der ersten Fundstelle bleibt (die Datenbank
 * sortiert nach Art und Name).
 */
export type LeistungsQuelle = {
  sku: string;
  name_de: string | null;
  name_en: string | null;
  category?: string | null;
  qty: number | string;
  status: string | null;
  nachgebucht_am?: string | null;
};

export type LeistungsZeile = {
  sku: string;
  name_de: string | null;
  name_en: string | null;
  category: string | null;
  /** Summe der gebuchten Menge; bei einer ganz stornierten Leistung die der stornierten Zeilen. */
  qty: number;
  /** Alle Zeilen dieser SKU sind storniert. */
  storniert: boolean;
  /** Anteil der Nachbuchung an der gebuchten Menge: Menge und die Zeitpunkte, je Kalendertag der erste, aufsteigend. `null` = nichts nachgebucht. */
  nachgebucht: { qty: number; am: string[] } | null;
};

const BERLIN_TAG = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });

/** Der Kalendertag eines Zeitpunkts in Hamburg (`2026-10-12`) — Nachbuchungen desselben Tages stehen als ein Datum da. */
export function berlinerTag(iso: string): string {
  return BERLIN_TAG.format(new Date(iso));
}

export function leistungenZusammenfassen(products: ReadonlyArray<LeistungsQuelle> | null | undefined): LeistungsZeile[] {
  const gruppen = new Map<string, LeistungsQuelle[]>();
  for (const p of products ?? []) gruppen.set(p.sku, [...(gruppen.get(p.sku) ?? []), p]);

  return [...gruppen.values()].map((zeilen) => {
    const erste = zeilen[0];
    const gebucht = zeilen.filter((z) => z.status === "booked");
    const quelle = gebucht.length > 0 ? gebucht : zeilen;
    const qty = quelle.reduce((summe, z) => summe + Number(z.qty), 0);
    const spaeter = gebucht.filter((z) => z.nachgebucht_am);
    const tage = new Map<string, string>();
    for (const z of [...spaeter].sort((a, b) => String(a.nachgebucht_am).localeCompare(String(b.nachgebucht_am)))) {
      const tag = berlinerTag(z.nachgebucht_am as string);
      if (!tage.has(tag)) tage.set(tag, z.nachgebucht_am as string);
    }
    return {
      sku: erste.sku,
      name_de: erste.name_de,
      name_en: erste.name_en,
      category: erste.category ?? null,
      qty,
      storniert: gebucht.length === 0,
      nachgebucht: spaeter.length > 0 ? { qty: spaeter.reduce((summe, z) => summe + Number(z.qty), 0), am: [...tage.values()] } : null,
    };
  });
}

/**
 * Der Satz zur Nachbuchung einer Leistung oder `null`, wenn nichts nachgebucht ist. `davon` nennt den Anteil, `ganz` gilt, wenn die ganze
 * gebuchte Menge nachgebucht ist. Platzhalter `{n}` und `{date}`; mehrere Tage stehen mit Komma hintereinander.
 */
export function nachbuchungsText(
  z: Pick<LeistungsZeile, "qty" | "storniert" | "nachgebucht">,
  texte: { davon: string; ganz: string },
  datum: (iso: string) => string,
): string | null {
  if (!z.nachgebucht || z.storniert) return null;
  const tage = z.nachgebucht.am.map(datum).join(", ");
  const vorlage = z.nachgebucht.qty >= z.qty ? texte.ganz : texte.davon;
  return vorlage.replace("{n}", String(z.nachgebucht.qty)).replace("{date}", tage);
}
