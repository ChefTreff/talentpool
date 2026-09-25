/** Zeilen aus `programme_board` / `programme_backlog` (Migration v2_programme_editor). */

export type BoardStage = {
  id: string;
  name: string;
  slug: string;
  type: string | null;
  room: string | null;
  sort_order: number;
  changeover_min: number;
  default_duration_min: number;
};

export type BoardDay = {
  id: string;
  day_date: string;
  label_de: string | null;
  label_en: string | null;
  programme_start: string | null;
  programme_end: string | null;
};

/** Form aus `session_speakers_public()` — Namen, kein Kontakt. */
export type SessionSpeaker = {
  person_id: string;
  role: string | null;
  first_name: string | null;
  last_name: string | null;
  employer_name: string | null;
  confirmed: boolean | null;
};

export function speakerName(s: SessionSpeaker): string {
  return [s.first_name, s.last_name].filter(Boolean).join(" ") || "—";
}

export type BoardSlot = {
  slot_id: string;
  stage_id: string;
  stage_name: string;
  event_day_id: string;
  day_date: string;
  event_id: string;
  start_at: string;
  end_at: string;
  slot_type: string;
  slot_status: string;
  session_id: string | null;
  title_de: string | null;
  title_en: string | null;
  format: string | null;
  language: string | null;
  access_mode: string | null;
  publish_status: string | null;
  capacity: number | null;
  speakers: SessionSpeaker[] | null;
  can_edit: boolean;
};

export type BacklogSession = {
  session_id: string;
  event_id: string;
  title_de: string | null;
  title_en: string | null;
  format: string | null;
  language: string | null;
  access_mode: string | null;
  publish_status: string | null;
  speakers: SessionSpeaker[] | null;
  can_edit: boolean;
};

export type BoardLabels = {
  slotStatus: Record<string, string>;
  slotType: Record<string, string>;
  format: Record<string, string>;
  language: Record<string, string>;
  accessMode: Record<string, string>;
  publishStatus: Record<string, string>;
  /** Themenliste (`session_topic`, SPK-027) — dieselbe wie bei der Einreichung. */
  topics: Record<string, string>;
};

/**
 * Wie eine Karte im Board aussieht — Fläche und Form (`flaeche`) und die
 * Schriftfarbe aller Zeilen der Karte (`text`).
 *
 * Eine Farbe für alle Zeilen, weil auf der Akzentfläche nur volles Weiß trägt
 * (4,88:1); eine gedämpfte zweite Textebene gibt es dort nicht (Skill,
 * Tokens „Akzent“, Regel 1). Die Hierarchie in der Karte kommt aus Schnitt
 * und Grösse.
 */
export type KartenStil = { flaeche: string; text: string; durchgestrichen?: boolean };

/**
 * Farbe im Board folgt dem Slot-Status (Datenmodell §Status-Maschinen).
 *
 * LEAD-017 (Konrad 24./25.09.: „Farben an unserem CI, Kalender-Design
 * moderner“, Status sofort erkennbar): jeder Status hat eine Fläche, eine
 * **Form** und ein Wort. Final ist die volle Akzentfläche — das fertige
 * Programm sieht nach Marke aus. „Bestätigt, Titel offen“ trägt die
 * Akzentleiste, „angefragt“ die Schraffur mit gelber Leiste, frei und
 * ungenutzt sind gestrichelt. Wer Farben nicht unterscheidet, erkennt den
 * Status an der Form (Design-Regel 4); das Wort steht in der Legende und für
 * Screenreader in jeder Karte. Kontrast gemessen: Weiß auf Akzent 4,88:1,
 * `accent-deep` auf `accent-soft` 5,65:1, `warning-ink` auf dem dunkleren
 * Streifen 4,54:1, `muted` auf `canvas` 5,15:1; Leisten und Striche ≥ 3:1.
 */
export const SLOT_STATUS_STYLE: Record<string, KartenStil> = {
  open: { flaeche: "border border-dashed border-border-strong bg-surface", text: "text-muted" },
  requested: { flaeche: "border-l-4 border-warning-ink bg-hatch-pending", text: "text-warning-ink" },
  confirmed_title_open: { flaeche: "border-l-4 border-accent bg-accent-soft", text: "text-accent-deep" },
  final: { flaeche: "bg-accent", text: "text-white" },
  unused: {
    flaeche: "border border-dashed border-border-strong bg-canvas",
    text: "text-muted",
    durchgestrichen: true,
  },
};

/** Belegt, aber ohne Status — fremde Bühnen in der Partner-Sicht (LEAD-035). */
export const KARTE_NEUTRAL: KartenStil = { flaeche: "border border-border bg-surface", text: "text-ink" };

export const SLOT_STATUS_ORDER = [
  "open",
  "requested",
  "confirmed_title_open",
  "final",
  "unused",
] as const;
