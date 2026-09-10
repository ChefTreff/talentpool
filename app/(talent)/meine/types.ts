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

/** Eigene Anmeldung; RLS `reg_self_sel` beschränkt die Tabelle auf die Person. */
export type MyRegistration = {
  id: string;
  session_id: string;
  status: string;
  created_at: string;
};

/**
 * Das Nötige aus `programme_public` — dieselbe View wie in `/programm`, hier
 * nur nach Session-ID nachgeschlagen.
 */
export type ParticipationSession = {
  session_id: string;
  event_id: string;
  title_de: string | null;
  title_en: string | null;
  language: string | null;
  access_mode: string | null;
  ticket_required: boolean | null;
  start_at: string | null;
  end_at: string | null;
  day_date: string | null;
  stage_name: string | null;
  room: string | null;
};

export type ParticipationLabels = {
  applicationStatus: Record<string, string>;
  registrationStatus: Record<string, string>;
};
