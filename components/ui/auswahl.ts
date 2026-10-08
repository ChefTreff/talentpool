/**
 * Reine Hilfen der Mehrfachauswahl, ohne JSX: die Tests laden keine `.tsx`-Dateien
 * (`--experimental-strip-types`), und was hier steht, lässt sich ohne Browser prüfen.
 */

export type AuswahlOption = { value: string; label: string };

/**
 * Werte, die gewählt sind, in der Liste aber fehlen — ein Begriff, der inzwischen umbenannt oder
 * entfernt wurde, während ein Partner ihn noch gespeichert hat. Reihenfolge wie in `value`, jeder
 * Wert einmal.
 *
 * Ohne diese Zeilen bliebe so ein Wert unsichtbar gewählt: nirgends abzuwählen, nirgends zu lesen.
 */
export function unbekannteWerte(options: AuswahlOption[], value: string[]): string[] {
  const bekannt = new Set(options.map((o) => o.value));
  return [...new Set(value.filter((v) => !bekannt.has(v)))];
}

/**
 * `value` in der Reihenfolge der Liste, unbekannte Werte dahinter.
 *
 * Die aufklappbare Auswahl gibt ihre Wahl immer so zurück: wer ein Kästchen abwählt und wieder
 * wählt, hat dann dieselbe Liste wie vorher. Ein Formular, das Listen vergleicht (`JSON.stringify`
 * in `components/partner/tour.ts`), sähe sonst eine Änderung, wo keine ist, und warnte beim
 * Verlassen der Seite (QS-051).
 */
export function nachListeSortiert(options: AuswahlOption[], value: string[]): string[] {
  const gewaehlt = new Set(value);
  return [...options.filter((o) => gewaehlt.has(o.value)).map((o) => o.value), ...unbekannteWerte(options, value)];
}

/**
 * Die Beschriftungen dessen, was gewählt ist, für die Zeile der zugeklappten Auswahl — in der
 * Reihenfolge der Liste, damit zwei Wege zum selben Ergebnis dieselbe Zeile zeigen. Ein unbekannter
 * Wert steht mit seinem Schlüssel da, statt zu fehlen.
 */
export function gewaehlteBeschriftungen(options: AuswahlOption[], value: string[]): string[] {
  const beschriftung = new Map(options.map((o) => [o.value, o.label]));
  return nachListeSortiert(options, value).map((v) => beschriftung.get(v) ?? v);
}
