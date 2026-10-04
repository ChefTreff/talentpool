/**
 * Ein HubSpot-Produkt über seine Artikelnummer finden — **nur Vergleichen, kein Zugriff.**
 *
 * Die Archiv-Karte (E5) listet nur Produkte ohne `hs_sku`. Ein einzelnes Produkt
 * mit Nummer (K-47: I-10729) erreicht man darüber nicht; die Suche arbeitet auf
 * der Liste, die die Route ohnehin liest, und fragt HubSpot nicht ein zweites Mal.
 * Eigene Datei ohne `server-only`, damit `npm test` sie prüfen kann.
 *
 * Verglichen wird ohne Gross-/Kleinschreibung und ohne Trennzeichen („I-10729“,
 * „i 10729“ und „I10729“ sind dieselbe Nummer). Treffer in der Artikelnummer
 * kommen vor Treffern im Namen; ab drei Zeichen, damit „I“ nicht den Katalog
 * liefert.
 */
export type SuchZeile = { id: string; name: string; sku: string | null };

export const SUCHE_MIN = 3;
export const SUCHE_MAX = 20;

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function findeNachArtikelnummer<T extends SuchZeile>(alle: T[], anfrage: unknown): T[] {
  if (typeof anfrage !== "string") return [];
  const q = norm(anfrage);
  if (q.length < SUCHE_MIN) return [];
  const rang = (p: T): number => {
    const sku = p.sku ? norm(p.sku) : "";
    if (sku && sku === q) return 0;
    if (sku && sku.includes(q)) return 1;
    return norm(p.name).includes(q) ? 2 : 3;
  };
  return alle
    .map((p) => ({ p, r: rang(p) }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r)
    .slice(0, SUCHE_MAX)
    .map((x) => x.p);
}
