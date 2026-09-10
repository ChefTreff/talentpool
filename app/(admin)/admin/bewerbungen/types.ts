/** Zeile aus `applications_overview()` — nur Sessions, die man entscheiden darf. */
export type OverviewRow = {
  session_id: string;
  event_id: string;
  title_de: string | null;
  title_en: string | null;
  start_at: string | null;
  end_at: string | null;
  stage_name: string | null;
  capacity: number | null;
  publish_status: string | null;
  application_deadline: string | null;
  released: boolean;
  /** Zähler je Status, z. B. `{"applied": 3, "accepted": 1}`. */
  counts: Record<string, number> | null;
};

/**
 * Zeile aus `applications_for_session()`.
 *
 * `display_name`, `answers` und `profile` sind NULL, wenn die Bewerbung nicht
 * geteilt wurde (`consent_share`) und der Aufrufer nur die Gastgeber-Org
 * vertritt. Die Oberfläche zeigt das als Hinweis, nicht als leere Zelle.
 */
export type QueueRow = {
  id: string;
  person_id: string;
  display_name: string | null;
  status: string;
  rank: number | null;
  answers: Record<string, string> | null;
  consent_share: boolean;
  confirm_by: string | null;
  confirmed_at: string | null;
  decided_at: string | null;
  created_at: string;
  profile: Record<string, string> | null;
};

/** Die vier Entscheidungen, die `decide_application` annimmt. */
export const DECISIONS = ["shortlisted", "accepted", "waitlisted", "declined"] as const;
export type Decision = (typeof DECISIONS)[number];

/** Stände, in denen `decide_application` noch etwas ändern darf. */
export const DECIDABLE = ["applied", "shortlisted", "accepted", "waitlisted", "declined", "promoted", "expired"];
