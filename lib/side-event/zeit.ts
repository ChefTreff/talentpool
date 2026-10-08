/** Alle Side Events liegen in Berlin — die Seite zeigt die Zeit so, wie sie im Programm steht, nicht in der Zone des Besuchers. */
export const ZEITZONE = "Europe/Berlin";

/**
 * Beginn eines Side Events für die öffentliche Seite `/side-event/<token>`: „Freitag, 16. April 2027, 19:00 MESZ“.
 *
 * **Zwei Formatierer, nicht einer.** `dateStyle`/`timeStyle` lassen sich nicht mit Einzeloptionen wie `timeZoneName` mischen
 * (ECMA-402): `new Intl.DateTimeFormat(…, { dateStyle, timeStyle, timeZoneName })` wirft seit Node 24 einen
 * `TypeError: Invalid option : option`. Die Seite baute den Formatierer so und antwortete auf **jeden** Aufruf mit 500 — ohne dass
 * ein Test es merkte, weil die Tests den Quelltext lasen und den Aufruf nie ausführten (08.10.2026). Darum steht die Formatierung
 * hier in einer Funktion, die `tests/side-event-zeit.test.ts` wirklich ausführt, und ein Wächter-Test prüft das ganze Repo auf
 * dieselbe Mischung.
 *
 * Ein unlesbares Datum ergibt einen leeren Text statt eines Fehlers: die Seite soll wegen einer Zeitangabe nie abstürzen.
 */
export function eventBeginn(sprache: string, iso: string): string {
  const zeitpunkt = new Date(iso);
  if (Number.isNaN(zeitpunkt.getTime())) return "";
  const tag = new Intl.DateTimeFormat(sprache, { dateStyle: "full", timeZone: ZEITZONE });
  const uhr = new Intl.DateTimeFormat(sprache, { hour: "2-digit", minute: "2-digit", timeZone: ZEITZONE, timeZoneName: "short" });
  return `${tag.format(zeitpunkt)}, ${uhr.format(zeitpunkt)}`;
}
