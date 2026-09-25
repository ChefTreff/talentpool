/** Klassen zusammenfügen; falsy Werte fallen raus. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * `w-full` für ein Feld — nur, wenn der Aufrufer keine eigene Breite setzt.
 *
 * `cn` fügt Klassen bloss aneinander. Stehen `w-full` und `w-44` zugleich am
 * Feld, entscheidet die Reihenfolge im erzeugten CSS, und dort gewann `w-full`:
 * jede feste Breite an `Input`, `Select` oder `Textarea` (58 Stellen) wurde zur
 * vollen Breite, Filterzeilen standen untereinander (LEAD-049, gemessen
 * 25.09.). Breiten mit Variante (`sm:w-44`) stehen in einer Media-Query und
 * setzen sich ohnehin durch.
 */
export function feldBreite(className?: string): string | false {
  return !/(^|\s)w-/.test(className ?? "") && "w-full";
}
