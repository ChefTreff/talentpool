/**
 * Welcher Knopf der Formatierungsleiste den Fokus bekommt (APG-Toolbar, Roving Tabindex): Pfeil rechts und links wandern und
 * laufen am Rand um, Pos1 und Ende springen an den Anfang und das Ende; jede andere Taste lässt den Fokus, wo er ist (`null`).
 *
 * Eigene Datei ohne React, damit `npm test` die Regel ausführt, statt den Quelltext nur zu lesen.
 */
export function naechsterKnopf(taste: string, aktiv: number, anzahl: number): number | null {
  if (anzahl <= 0) return null;
  if (taste === "Home") return 0;
  if (taste === "End") return anzahl - 1;
  if (taste === "ArrowRight") return (aktiv + 1) % anzahl;
  if (taste === "ArrowLeft") return (aktiv - 1 + anzahl) % anzahl;
  return null;
}
