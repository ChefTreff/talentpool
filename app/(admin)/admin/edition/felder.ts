import { dayInZone, formatTime, parseClock, zonedTimeToInstant } from "@/lib/tz";

/**
 * Felder des Gerüsts der Edition (ADM-085): Gültigkeitstage der Bühnen und Zeiten der Sperrzeiten. Reine Funktionen —
 * `tests/adm-085-buehnen-stammdaten.test.ts` führt sie aus, die Seite (`GeruestView`, ein Client-Baustein) ruft sie nur.
 */

/**
 * Gültigkeitstage in der Oberfläche: **alle angehakt** heißt „jeder Eventtag“ und wird leer gespeichert; nimmt man einen Tag weg,
 * gilt die Bühne nur noch an den übrigen. Im Entwurf stehen die gewählten Tage als kommagetrennte Liste (`JJJJ-MM-TT`); ohne Entwurf
 * zeigt die Auswahl den gespeicherten Stand — und bei einer leeren Liste alle Tage.
 */
export function gewaehlteTage(csv: string | undefined, gespeichert: readonly string[], alle: readonly string[]): string[] {
  if (csv !== undefined) return csv === "" ? [] : csv.split(",");
  return gespeichert.length === 0 ? [...alle] : [...gespeichert];
}

/** Zum Speichern: alle Tage gewählt = leer (alle Eventtage), sonst die Auswahl. */
export function tageSpeichern(csv: string, alle: readonly string[]): string[] {
  const auswahl = csv === "" ? [] : csv.split(",");
  return auswahl.length === alle.length ? [] : auswahl;
}

/**
 * Welches Gerüst die Seite nachlädt (ADM-107): `programme_skeleton()` ohne Argument liefert die Edition selbst, Bühnen und Sperrzeiten
 * hängen aber am Summit. `summits` ist die Wahl des Boards (`boardEvents`, auf diese Edition verengt) — der erste gilt; ist er schon die
 * geladene Veranstaltung, oder gibt es keinen, wird nichts nachgeladen.
 */
export function geruestEventId(geladen: string | null, summits: readonly { id: string }[]): string | null {
  const erster = summits[0];
  return erster && erster.id !== geladen ? erster.id : null;
}

/** Sperrzeit im Feld `datetime-local`: die Wanduhrzeit der Event-Zone, nicht die des Browsers. */
export function zeitFeld(iso: string, zone: string): string {
  return `${dayInZone(iso, zone)}T${formatTime(iso, zone)}`;
}

/** Zurück vom Feld zum Zeitpunkt (Event-Zone, Zeitumstellung inbegriffen); `""`, wenn das Feld nicht lesbar ist. */
export function feldZeit(wert: string, zone: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(wert);
  const minuten = m ? parseClock(m[2]) : null;
  return m && minuten !== null ? zonedTimeToInstant(m[1], minuten, zone).toISOString() : "";
}
