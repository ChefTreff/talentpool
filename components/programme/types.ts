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
};

/** Farbe im Board folgt dem Slot-Status (Datenmodell §Status-Maschinen). */
export const SLOT_STATUS_STYLE: Record<string, string> = {
  open: "border-border bg-surface",
  requested: "border-warning-soft bg-warning-soft",
  confirmed_title_open: "border-accent-soft bg-accent-soft",
  final: "border-success-soft bg-success-soft",
  unused: "border-dashed border-border bg-surface-hover",
};

export const SLOT_STATUS_ORDER = [
  "open",
  "requested",
  "confirmed_title_open",
  "final",
  "unused",
] as const;
