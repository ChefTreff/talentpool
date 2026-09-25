/**
 * Maßangaben auf der Messestand-Seite (PART-085, Konrad 25.09.): alles als
 * „5x6 m“. Die Standgröße steht als Text am Produkt (`size_note`, „3 m × 3 m“),
 * die Rückwand in Millimetern am Stand — beides wird hier in dieselbe Form
 * gebracht. Unbekannte Schreibweisen bleiben, wie sie sind: lieber ein
 * uneinheitlicher Text als ein falscher.
 */

const ZAHL = String.raw`(\d+(?:[.,]\d+)?)`;
const AB_M = new RegExp(String.raw`^\s*${ZAHL}\s*m\s*[×x*]\s*${ZAHL}\s*m\s*$`, "i");

/** „3 m × 3 m“ → „3x3 m“; „1 m × 1,5 m“ → „1x1,5 m“. */
export function meterAngabe(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = AB_M.exec(text);
  return m ? `${m[1]}x${m[2]} m` : text;
}

/** Rückwand aus Millimetern: 3000 × 2500 → „3x2,5 m“ (Dezimaltrenner der Sprache). */
export function rueckwandMeter(breiteMm: number, hoeheMm: number, locale: string): string {
  const zahl = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return `${zahl.format(breiteMm / 1000)}x${zahl.format(hoeheMm / 1000)} m`;
}
