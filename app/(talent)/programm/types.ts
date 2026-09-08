/** Zeile aus der View `programme_public` (nur veröffentlichte Sessions). */
export type ProgrammeSession = {
  session_id: string;
  event_id: string;
  format: string | null;
  title_de: string | null;
  title_en: string | null;
  description_de: string | null;
  description_en: string | null;
  language: string | null;
  access_mode: string | null;
  capacity: number | null;
  ticket_required: boolean | null;
  application_deadline: string | null;
  track_id: string | null;
  tags: string[] | null;
  host_org_id: string | null;
  slot_id: string | null;
  start_at: string | null;
  end_at: string | null;
  stage_id: string | null;
  stage_name: string | null;
  room: string | null;
  event_day_id: string | null;
  day_date: string | null;
};

/** Zeile aus `my_applications()` — Status ist bis zur Freigabe maskiert. */
export type MyApplication = {
  id: string;
  session_id: string;
  status: string;
  answers: Record<string, string> | null;
  consent_share: boolean;
  confirm_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionQuestion = {
  id: string;
  session_id: string;
  question_id: string | null;
  label_de: string | null;
  label_en: string | null;
  type: string | null;
  options: { value: string; label_de?: string; label_en?: string }[] | null;
  required: boolean;
  sort_order: number | null;
};

/**
 * Schlüssel, unter dem `apply_to_session` eine Antwort erwartet:
 * `question_id`, wenn die Frage aus dem Katalog stammt, sonst die eigene ID.
 */
export function answerKey(q: SessionQuestion): string {
  return q.question_id ?? q.id;
}

export type ProgrammeLabels = {
  format: Record<string, string>;
  language: Record<string, string>;
  accessMode: Record<string, string>;
  applicationStatus: Record<string, string>;
};
