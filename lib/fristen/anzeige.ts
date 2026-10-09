/**
 * Anzeige der Fristen (ADM-099): Gruppen je Bereich, Erinnerung in Tagen, Eingabe als lokale Zeit. Reine Hilfen ohne
 * Server- und Client-Importe, damit `npm test` sie prüft.
 */

/** Eine Zeile aus `deadlines_overview` — **ohne Schlüssel**: der ist eine Code-Schnittstelle und steht nirgends in der Oberfläche. */
export type Frist = {
  id: string;
  edition_id: string;
  audience: string;
  due_at: string;
  label_de: string | null;
  label_en: string | null;
  description_de: string | null;
  description_en: string | null;
  reminder_days: number;
  reminder_hours: number;
  custom: boolean;
  can_edit: boolean;
  usage_count: number;
};

/** Die Bereiche der Übersicht; `system` fasst alles zusammen, was keinem der drei Bereiche gehört (award, all …). */
export const FRIST_BEREICHE = ["speaker", "partner", "volunteers", "system"] as const;
export type FristBereich = (typeof FRIST_BEREICHE)[number];

/** Zielgruppen, die einem eigenen Bereich gehören (Rest ⇒ System). */
const ZIELGRUPPE_BEREICH: Record<string, FristBereich> = { speaker: "speaker", partner: "partner", volunteer: "volunteers" };

export function bereichDerFrist(audience: string): FristBereich {
  return ZIELGRUPPE_BEREICH[audience] ?? "system";
}

export function leseBereich(roh: string | undefined): FristBereich {
  return (FRIST_BEREICHE as readonly string[]).includes(roh ?? "") ? (roh as FristBereich) : "speaker";
}

/** Zielgruppe, mit der ein Bereich neue Fristen anlegt; System ⇒ `all` (nur admin darf). */
export const NEUE_ZIELGRUPPE: Record<FristBereich, string> = { speaker: "speaker", partner: "partner", volunteers: "volunteer", system: "all" };

/** Abschnitt, der Fristen eines Bereichs ändern darf — wie `deadline_section()` in der Datenbank. */
export const BEREICH_ABSCHNITT = {
  speaker: "deadlinesSpeaker",
  partner: "deadlinesPartner",
  volunteers: "deadlinesVolunteers",
  system: "deadlinesSystem",
} as const;

/** Die Beschriftung in der Sprache der Person; fehlt sie, die andere — nie der Schlüssel (der kommt gar nicht erst an). */
export function beschriftung(f: Pick<Frist, "label_de" | "label_en">, locale: string): string {
  const [erste, zweite] = locale === "en" ? [f.label_en, f.label_de] : [f.label_de, f.label_en];
  return erste?.trim() || zweite?.trim() || "—";
}

/** Erinnerung als Text: ganze Tage, sonst Stunden (spätere Einzelfälle). `t` trägt `reminderAtDue`, `reminderDays`, `reminderHours`. */
export function erinnerungText(f: Pick<Frist, "reminder_hours">, t: Record<string, string>): string {
  const h = f.reminder_hours;
  if (h === 0) return t.reminderAtDue;
  if (h % 24 === 0) return t.reminderDays.replace("{n}", String(h / 24));
  return t.reminderHours.replace("{n}", String(h));
}

/** `timestamptz` ↔ `datetime-local` (Browserzeit; für eine Frist genau genug). */
export function inLokaleZeit(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Eingabe zu Tagen: ganze Zahl 0–90, sonst `null` (die Datenbank lehnt Anderes mit `invalid_reminder` ab). */
export function leseTage(text: string): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= 0 && n <= 90 ? n : null;
}

export function zaehleJeBereich(fristen: Pick<Frist, "audience">[]): Record<FristBereich, number> {
  const n: Record<FristBereich, number> = { speaker: 0, partner: 0, volunteers: 0, system: 0 };
  for (const f of fristen) n[bereichDerFrist(f.audience)] += 1;
  return n;
}
