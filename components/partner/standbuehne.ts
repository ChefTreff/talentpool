import type { BadgeTone } from "@/components/ui/Badge";
import { formatMinutes, parseClock } from "@/lib/tz";

/**
 * Standbühne aus Sicht des Partners (PART-090, PART-080): Zeitfenster und
 * Partner-Status. Reine Funktionen ohne Server — die Tabelle unter
 * `/partner/buehne/tabelle` nutzt sie, und das Board (Speaker-Chat) kann sie
 * für Markierung und Legende übernehmen, ohne die Regel neu zu schreiben.
 */

// ---------------------------------------------------------------- Zeitfenster

/**
 * Die Regel steht in der Datenbank (`partner_booth_window`, durchgesetzt in
 * `create_slot` und `move_slot`). Hier wird sie nur gespiegelt, damit die
 * Oberfläche das Fenster zeigen und offensichtliche Fehler vor dem Absenden
 * melden kann; `tests/partner-standbuehne.test.ts` hält beide Seiten zusammen.
 *
 * PART-090 (Konrad 25.09., ersetzt PART-079): das Fenster sind die
 * **Öffnungszeiten der Bühne** (`stage_day.open_from/open_to`, gepflegt vom Team
 * im Admin), ohne Aufschlag und ohne feste Schlusszeit. Fehlt eine Grenze, gilt
 * der Tagesrahmen der Veranstaltung (`event_day.programme_start/programme_end`).
 */

/** Ende ohne jeden Rahmen: 24:00 wie in der Datenbank — praktisch keine Grenze. */
export const OHNE_ENDE = 24 * 60;

/** Fenster in Minuten seit Mitternacht; `von` fehlt, wenn es an dem Tag gar keinen Beginn gibt. */
export type StandFenster = { von: number | null; bis: number };

/**
 * Fenster je Grenze: Öffnungszeit der Bühne, sonst der Tagesrahmen der
 * Veranstaltung, beim Ende zuletzt 24:00 — genau die `coalesce`-Folge der
 * Datenbank.
 */
export function standFenster(
  openFrom: string | null,
  openTo: string | null,
  tagVon: string | null = null,
  tagBis: string | null = null,
): StandFenster {
  return {
    von: parseClock(openFrom) ?? parseClock(tagVon),
    bis: parseClock(openTo) ?? parseClock(tagBis) ?? OHNE_ENDE,
  };
}

/** Liegt ein Slot (Minuten seit Mitternacht) ganz im Fenster? Dieselben Grenzen wie in der Datenbank. */
export function imFenster(f: StandFenster, start: number, ende: number): boolean {
  return (f.von === null || start >= f.von) && ende <= f.bis;
}

/** Uhrzeit; 24:00 bleibt 24:00 (`formatMinutes` rechnet es auf 00:00 herum). */
function uhr(minuten: number): string {
  return minuten >= OHNE_ENDE ? "24:00" : formatMinutes(minuten);
}

/** „12:00–20:00“; ohne Beginn „bis 20:00“ über die übergebene Vorlage mit `{bis}`. */
export function fensterText(f: StandFenster, nurBis: string): string {
  return f.von === null ? nurBis.replace("{bis}", uhr(f.bis)) : `${uhr(f.von)}–${uhr(f.bis)}`;
}

// ---------------------------------------------------------------- Partner-Status

/**
 * Der interne Slot-Status (offen, angefragt, Titel offen, final) ist Sprache
 * der Programmleitung. Der Partner sieht stattdessen, wo seine Session steht:
 *
 * - `offen` — Slot ohne Session
 * - `in_bearbeitung` — Entwurf (`draft`)
 * - `zurueckgegeben` — Entwurf mit Rückmeldung der Programmleitung (PART-083)
 * - `zur_freigabe` — „Veröffentlichen“ angefragt (`review`), die Programmleitung ist dran
 * - `veroeffentlicht` — im offiziellen Programm (`published`)
 * - `abgesagt` — `cancelled`
 */
export const PARTNER_STATUS = [
  "offen",
  "in_bearbeitung",
  "zurueckgegeben",
  "zur_freigabe",
  "veroeffentlicht",
  "abgesagt",
] as const;

export type PartnerStatus = (typeof PARTNER_STATUS)[number];

export function partnerStatus(x: {
  sessionId: string | null;
  publishStatus: string | null;
  returnNote?: string | null;
}): PartnerStatus {
  if (!x.sessionId) return "offen";
  switch (x.publishStatus) {
    case "published":
      return "veroeffentlicht";
    case "review":
      return "zur_freigabe";
    case "cancelled":
      return "abgesagt";
    default:
      // Der Grund bleibt stehen, bis die Programmleitung freigibt — angezeigt wird
      // er als Stand nur, solange die Session wieder beim Partner liegt.
      return x.returnNote ? "zurueckgegeben" : "in_bearbeitung";
  }
}

/**
 * Farbe aus Sicht des Partners: Gelb heißt „ihr seid dran“ (Rückmeldung
 * offen), Akzent „die Programmleitung ist dran“. In der Team-Tabelle ist
 * `review` gelb — dort ist das Team dran. Der Wortlaut trägt die Information,
 * die Farbe wiederholt sie nur.
 */
export const PARTNER_STATUS_TON: Record<PartnerStatus, BadgeTone> = {
  offen: "neutral",
  in_bearbeitung: "neutral",
  zurueckgegeben: "warning",
  zur_freigabe: "accent",
  veroeffentlicht: "success",
  abgesagt: "error",
};

/**
 * Was für die Anfrage noch fehlt — dieselben Bedingungen wie in
 * `partner_request_publish` (und `release_partner_session`): Titel in beiden
 * Sprachen, eine Beschreibung in mindestens einer.
 */
export type FehlendesFeld = "title_de" | "title_en" | "description";

export function fehlendFuerFreigabe(s: {
  title_de: string | null;
  title_en: string | null;
  description_de: string | null;
  description_en: string | null;
}): FehlendesFeld[] {
  const leer = (v: string | null) => !v || v.trim() === "";
  const fehlt: FehlendesFeld[] = [];
  if (leer(s.title_de)) fehlt.push("title_de");
  if (leer(s.title_en)) fehlt.push("title_en");
  if (leer(s.description_de) && leer(s.description_en)) fehlt.push("description");
  return fehlt;
}

/** Die Feldliste aus dem `detail` von 22023 `fields_required` („title_en, description_de|description_en“). */
export function fehlendAusDetail(detail: string | undefined): FehlendesFeld[] {
  const teile = (detail ?? "").split(",").map((x) => x.trim());
  const fehlt: FehlendesFeld[] = [];
  if (teile.includes("title_de")) fehlt.push("title_de");
  if (teile.includes("title_en")) fehlt.push("title_en");
  if (teile.some((x) => x.startsWith("description"))) fehlt.push("description");
  return fehlt;
}
