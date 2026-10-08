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
 * Arten (`stage.type`), bei denen die Partner-Organisation eine **Wahl** ist (ADM-106): eine Haupt- oder Nebenbühne mit Partner gilt als
 * gebrandet (`stage.kind`, 0274). Bei Ständen, Räumen, Interview Tables und Side-Event-Orten setzen die Partner-Funktionen die Zuordnung
 * (Standbuchung, Fläche) — das Formular zeigt sie dort nur an und fasst sie nicht an.
 */
export const PARTNER_WAHL_ARTEN = ["main", "side"] as const;

/** Zeigt das Formular für diese Art das Partner-Feld? */
export function partnerFeldSichtbar(art: string | null | undefined): boolean {
  return PARTNER_WAHL_ARTEN.some((a) => a === art);
}

/**
 * Der Partner einer **bestehenden** Bühne im Speichern-Aufruf (ADM-106): nur, wenn die Zeile das Feld zeigt und jemand es angefasst hat.
 * Eine leere ID geht mit — sie nimmt den Partner ab (`upsert_stage` macht daraus NULL); fehlt der Schlüssel, bleibt der Stand.
 */
export function partnerFuerSpeichern(art: string | null | undefined, wert: string | undefined): string | undefined {
  return wert !== undefined && partnerFeldSichtbar(art) ? wert : undefined;
}

/** Der Partner einer **neuen** Bühne: nur eine gewählte ID bei einer Art, die das Feld zeigt — leer oder nach einem Artwechsel unsichtbar geht nichts mit. */
export function partnerFuerNeue(art: string | null | undefined, wert: string | undefined): string | undefined {
  return wert ? partnerFuerSpeichern(art, wert) : undefined;
}

/**
 * Der gewählte Partner einer Bühne: **der Entwurf gewinnt** (leer = abgewählt), sonst der gespeicherte Stand. Der Entwurf trägt nur die ID;
 * den Namen eines frisch gewählten Partners kennt `namen` (nach ID) — fehlt er, steht nur die ID da, nie ein fremder Name.
 */
export function gewaehlterPartner(
  entwurf: string | undefined,
  gespeichert: { id: string | null; name: string | null },
  namen: Readonly<Record<string, string>>,
): { id: string; name: string | null } | null {
  if (entwurf === undefined) return gespeichert.id ? { id: gespeichert.id, name: gespeichert.name } : null;
  if (entwurf === "") return null;
  return { id: entwurf, name: namen[entwurf] ?? (entwurf === gespeichert.id ? gespeichert.name : null) };
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
