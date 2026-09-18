/**
 * Eine CSV-Zelle — mit Schutz gegen Formelauswertung in Excel.
 *
 * **Warum das nötig ist.** Unsere CSV-Dateien enthalten Freitext, den andere
 * Menschen eingetragen haben: Namen, Adressen, Hinweise. Excel und LibreOffice
 * behandeln eine Zelle, die mit `=`, `+`, `-` oder `@` beginnt, als **Formel**
 * und führen sie beim Öffnen aus. Ein Eintrag wie `=HYPERLINK("http://…")`
 * oder ein DDE-Aufruf wird damit zu Code auf dem Rechner der Person, die die
 * Liste öffnet — beim Shuttle-Unternehmen, in der Produktion, im Team.
 * Anführungszeichen zu verdoppeln schützt davor **nicht**: es macht den Wert
 * zu einer gültigen Zelle, und genau die wird dann ausgewertet.
 *
 * **Was wir tun.** Vor einen gefährlichen Anfang kommt ein Leerzeichen. Der
 * Wert bleibt lesbar — eine Telefonnummer `+49 40 …` liest sich weiter als
 * Telefonnummer —, aber Excel sieht keinen Formelanfang mehr.
 *
 * **Reine Zahlen bleiben Zahlen.** `-5` ist keine Formel, sondern ein Wert;
 * ein Leerzeichen davor würde aus einer Zahl Text machen und jede Summe in der
 * Tabelle stillschweigend verfälschen. Deshalb die Ausnahme.
 *
 * Bitte nicht als überflüssig entfernen: der Schutz ist unsichtbar, solange
 * niemand ihn angreift (Befund der Architektur-Session an #81, 18.09.2026).
 */

/** Zeichen, mit denen eine Tabellenkalkulation eine Formel beginnen lässt. */
const FORMELSTART = /^[=+\-@\t\r]/;

/** Eine reine Zahl, auch negativ und mit Dezimaltrenner — die bleibt, wie sie ist. */
const NUR_ZAHL = /^-?\d+(?:[.,]\d+)?$/;

/** Der rohe Wert, gegen Formelauswertung entschärft, **ohne** Anführungszeichen. */
export function csvSafe(value: unknown): string {
  const s = String(value ?? "");
  if (s === "" || NUR_ZAHL.test(s)) return s;
  return FORMELSTART.test(s) ? ` ${s}` : s;
}

/**
 * Eine fertige CSV-Zelle: entschärft, Anführungszeichen verdoppelt, in
 * Anführungszeichen gesetzt.
 *
 * Immer in Anführungszeichen, auch wenn der Wert harmlos aussieht — sonst
 * entscheidet die Trennzeichenwahl darüber, ob eine Zelle zerfällt.
 */
export function csvCell(value: unknown): string {
  return `"${csvSafe(value).replace(/"/g, '""')}"`;
}
