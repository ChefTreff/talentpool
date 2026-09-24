/** Zeile aus `my_sessions()`. `latest_submission` ist die letzte Einreichung. */
export type SessionSubmission = {
  id: string;
  title: string | null;
  description: string | null;
  topics: string[] | null;
  language: string | null;
  notes: string | null;
  status: "submitted" | "approved" | "rejected" | "superseded";
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type CoSpeaker = {
  person_id: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
};

export type MySession = {
  session_id: string;
  event_id: string;
  event_name: string | null;
  title_de: string | null;
  title_en: string | null;
  description_de: string | null;
  description_en: string | null;
  language: string | null;
  format: string | null;
  access_mode: string | null;
  publish_status: string | null;
  speaker_role: string | null;
  confirmed: boolean | null;
  start_at: string | null;
  end_at: string | null;
  stage_name: string | null;
  room: string | null;
  timezone: string | null;
  co_speakers: CoSpeaker[] | null;
  latest_submission: SessionSubmission | null;
  /** Gesetzt, wenn die Assistenz zusieht: für wen sie gerade arbeitet. */
  on_behalf_of: { person_id: string; first_name: string | null; last_name: string | null } | null;
  /** Die Technik-Ansage des Speakers (A7.2). Feste Schlüssel, freie Werte. */
  tech: Record<string, string> | null;
};

/**
 * Die fünf Felder der Technik-Ansage, in der Reihenfolge der Regie 2026.
 *
 * Die Schlüssel sind fest — `update_session_tech` weist alles andere ab —, die
 * Werte sind Freitext (Konrad, 17.09.: „ich denke Freitext bietet mehr
 * Flexibilität"). `lines` sagt, ob das Feld eine Zeile oder ein Feld braucht.
 */
/**
 * Was der Speaker zur Technik sagt — seit dem Umbau vom 23.09. nur noch zwei
 * Felder (SPK-029).
 *
 * „Personen auf der Bühne", „Präsentation und Medien" und „Mobiliar" sind
 * raus: das weiß der Speaker nicht, das disponieren die Stage Leads. Sie
 * stehen jetzt in `regie_cue` (LEAD-012).
 *
 * Das Mikrofon ist eine **Auswahl** (Konrad 21.09.), der Rest ein Kurztext.
 */
export const TECH_FIELDS: { key: string; kind: "select" | "text"; vocab?: string }[] = [
  { key: "microphone", kind: "select", vocab: "speaker_microphone" },
  { key: "special_requirements", kind: "text" },
];

/** Was `update_session_tech` je Feld annimmt. */
export const MAX_TECH_CHARS = 500;

/** Antwort aus `presentation_window()`. */
export type PresentationWindow = {
  deadline_at: string | null;
  slot_start: string | null;
  effective_due: string | null;
  late_now: boolean;
  accepts_late: boolean;
};

/** Zeile aus `my_speaker_assets()`. */
export type SpeakerAsset = {
  id: string;
  profile_id: string;
  session_id: string | null;
  kind: string;
  storage_path: string;
  filename: string | null;
  mime: string | null;
  size_bytes: number | null;
  version: number;
  is_current: boolean;
  late: boolean;
  tech_check_status: string;
  tech_check_note: string | null;
  slides_release: boolean;
  created_at: string;
};

// Bucket und Dateinamen-Regel gelten für alle Speaker-Dateien, nicht nur für
// Präsentationen — sie stehen deshalb eine Ebene höher und werden hier nur
// weitergereicht, damit es sie genau einmal gibt (SPK-004).
export { SPEAKER_BUCKET as BUCKET, safeFileName } from "../types";

/** Was der Bucket annimmt (PDF, PowerPoint, Keynote) — 100 MB Grenze. */
export const PRESENTATION_MIME = [
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.apple.keynote",
  "application/x-iwork-keynote-sffkey",
];
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
