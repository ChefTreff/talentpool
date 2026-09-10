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

/**
 * So liegt eine Option in der Datenbank: `question_catalog.options` ist als
 * `[{key,label_de,label_en}]` dokumentiert, ältere eigene Fragen tragen
 * stattdessen `value`. Der Server macht daraus eine `QuestionOption`.
 */
export type RawQuestionOption = {
  key?: string;
  value?: string;
  label_de?: string;
  label_en?: string;
};

/** Aufgelöst fürs Formular: `value` ist genau das, was in der Antwort landet. */
export type QuestionOption = { value: string; label_de?: string; label_en?: string };

/**
 * Eine Frage, wie die Oberfläche sie braucht — Text, Typ und Optionen schon
 * aufgelöst.
 *
 * Bei Katalogfragen stehen Label, Hilfetext, Typ und Optionen in
 * `question_catalog`; `session_question` trägt dann nur `question_id`,
 * `required` und die Reihenfolge. Eigene Partner-Fragen bringen alles selbst
 * mit. Diese Unterscheidung gehört auf den Server, nicht ins Formular.
 */
export type SessionQuestion = {
  /** Schlüssel für `apply_to_session`: question_id (Katalog) sonst eigene ID. */
  key: string;
  session_id: string;
  label: string;
  help: string | null;
  type: string;
  options: QuestionOption[] | null;
  required: boolean;
};

export type ProgrammeLabels = {
  format: Record<string, string>;
  language: Record<string, string>;
  accessMode: Record<string, string>;
  applicationStatus: Record<string, string>;
};
