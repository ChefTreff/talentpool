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
  /** Format der Session (seit `v6_bewerbungen_uebersicht`, ADM-003). */
  format: string | null;
};

/**
 * Zeile aus `applications_admin_list()` (ADM-003): eine Bewerbung mit ihrer
 * Session, für das Team ungekürzt (auch ohne Einwilligung). `answers` trägt
 * den Fragetext, `total_count` die Treffer insgesamt fürs Blättern.
 */
export type ListRow = {
  id: string;
  session_id: string;
  session_title_de: string | null;
  session_title_en: string | null;
  format: string | null;
  start_at: string | null;
  released: boolean;
  person_id: string | null;
  display_name: string | null;
  email: string | null;
  status: string;
  rank: number | null;
  consent_share: boolean;
  decided_at: string | null;
  created_at: string;
  profile: Record<string, string> | null;
  answers: { key: string; label_de: string; label_en: string; value: unknown }[] | null;
  total_count: number;
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
