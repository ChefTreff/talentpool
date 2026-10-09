/**
 * Welcher Abschnitt gerade „im Bild“ ist (Balken „Auf dieser Seite“, ADM-093): der, dessen Oberkante der Linie unter dem
 * Balken am nächsten ist, ohne sie zu überschreiten — also der letzte, den man schon erreicht hat.
 *
 * - `oberkanten`: Abstand jedes Abschnitts vom oberen Fensterrand in px (`getBoundingClientRect().top`), in der Reihenfolge der
 *   Übersicht; `null`, wenn es den Abschnitt auf der Seite (noch) nicht gibt.
 * - `linie`: der Abstand vom oberen Fensterrand, ab dem ein Abschnitt als erreicht gilt (Höhe des Balkens plus Luft).
 * - `amEnde`: die Seite ist ganz nach unten gescrollt — dann gilt der unterste Abschnitt, auch wenn er zu kurz ist, um die
 *   Linie je zu erreichen; sonst käme man an den letzten nie heran.
 *
 * Vor dem ersten Abschnitt (Seitenanfang, alles noch unter der Linie) gilt der **oberste**. Gibt es keinen einzigen: 0.
 *
 * Eigene Datei ohne React, damit `npm test` die Regel ausführt.
 */
export function aktiverAbschnitt(oberkanten: (number | null)[], linie: number, amEnde = false): number {
  const da = oberkanten.map((o, i) => (o === null ? -1 : i)).filter((i) => i >= 0);
  if (da.length === 0) return 0;
  const oben = (i: number) => oberkanten[i] as number;
  if (amEnde) return da.reduce((best, i) => (oben(i) > oben(best) ? i : best));
  const erreicht = da.filter((i) => oben(i) <= linie);
  if (erreicht.length > 0) return erreicht.reduce((best, i) => (oben(i) > oben(best) ? i : best));
  return da.reduce((best, i) => (oben(i) < oben(best) ? i : best));
}
