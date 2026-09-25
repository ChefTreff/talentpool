/**
 * Verlauf der Speaker-Pipeline (LEAD-039 Schnitt 2, LEAD-025/027): Notizen,
 * Kontakte und Aufgaben mit Frist. Gemeinsam für das Fenster der Speaker-Leads,
 * das Admin-Detail und die Übersicht unter `/admin/speaker/verlauf`.
 *
 * Geschrieben wird über `add_speaker_activity`, `update_speaker_activity`,
 * `set_speaker_activity_done` und `delete_speaker_activity`; gelesen über
 * `speaker_activities` (je Speaker) und `manager_speakers` (nächster Schritt,
 * letzte Aktivität). Sichtbar für alle mit `can_manage_speaker` — nie für den
 * Speaker selbst, die Assistenz oder Partner.
 */

/** Die Arten in der Reihenfolge des Vokabulars `speaker_activity_kind`. */
export const VERLAUF_ARTEN = ["note", "email", "call", "meeting", "message", "task"] as const;
export type VerlaufArt = (typeof VERLAUF_ARTEN)[number];

/** Höchstlänge eines Eintrags — wie `speaker_activity_body_chk`. */
export const MAX_EINTRAG = 2000;

/** Zeile aus `speaker_activities(profile)`. */
export type VerlaufEintrag = {
  id: string;
  kind: VerlaufArt | string;
  body: string;
  occurred_at: string;
  due_on: string | null;
  assignee_person_id: string | null;
  assignee_name: string | null;
  done_at: string | null;
  author_person_id: string | null;
  author_name: string | null;
  can_edit: boolean;
  can_complete: boolean;
};

/** `next_task` aus `manager_speakers`: die früheste offene Aufgabe. */
export type NaechsterSchritt = {
  id: string;
  body: string;
  due_on: string;
  assignee_person_id: string | null;
  assignee_name: string | null;
};

/** Was `manager_speakers` zum Verlauf liefert. */
export type VerlaufStand = {
  open_tasks: number | null;
  next_task: NaechsterSchritt | null;
  last_activity_at: string | null;
};

/** Heutiges Datum als `YYYY-MM-DD` in der Zeitzone des Summits. */
export function heute(timeZone = "Europe/Berlin", jetzt = new Date()): string {
  // `en-CA` schreibt ISO-Datum; die Zeitzone macht aus dem Moment den Kalendertag.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(jetzt);
}

/** Frist-Stand einer offenen Aufgabe: vor heute, heute oder später. */
export function fristStand(dueOn: string, heuteIso: string): "ueberfaellig" | "heute" | "spaeter" {
  if (dueOn < heuteIso) return "ueberfaellig";
  if (dueOn === heuteIso) return "heute";
  return "spaeter";
}
