/** Antwort aus `my_manager_scope()`. */
export type ManagerScope = {
  /** Die eigene Person (seit Migration 0104) — entscheidet, ob die Übergabe angeboten wird. */
  person_id: string;
  /** Team im Sinne der Speaker-Betreuung — sieht und darf alles. */
  team: boolean;
  /** Kein Scope-Filter nötig (Team oder globaler Manager). */
  all: boolean;
  /** Ohne das gibt es den Bereich nicht (404 über `requireArea`). */
  is_manager: boolean;
  editions: { id: string; name: string | null; slug: string | null }[];
  stages: { id: string; name: string | null; event_id: string; edition_id: string }[];
  stage_days: {
    id: string;
    stage_id: string;
    stage_name: string | null;
    event_day_id: string;
    day_date: string;
    edition_id: string;
  }[];
  slots: {
    id: string;
    stage_id: string;
    stage_name: string | null;
    start_at: string;
    end_at: string;
    session_id: string | null;
    edition_id: string;
  }[];
  owned_profiles: number;
};

/** Eine Lead-Person aus `speaker_managers()`. */
export type ManagerOption = { person_id: string; display_name: string | null };

/** Eine Session, an der der Speaker hängt (aus `manager_speakers`). */
export type SpeakerSession = {
  session_id: string;
  title_de: string | null;
  title_en: string | null;
  publish_status: string | null;
  start_at: string | null;
  stage_name: string | null;
};

/** Zeile aus `manager_speakers()`. */
export type ManagedSpeaker = {
  id: string;
  person_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  /** Kontaktdaten gibt die RPC nur im Scope heraus. */
  email: string | null;
  job_title: string | null;
  organization_name: string | null;
  speaker_type: string;
  pipeline_status: string;
  owner_person_id: string | null;
  owner_name: string | null;
  reception_eligible: boolean;
  travel_costs_covered: boolean;
  travel_costs_approved: boolean;
  hospitality_status: string;
  hotel_tier: string;
  pass_type: string;
  lounge_access: boolean;
  invited_at: string | null;
  /** Seit Migration 0099: Zeitpunkt und Grund statt nur Status. */
  confirmed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  assistant_name: string | null;
  sessions: SpeakerSession[] | null;
  /** Offene Schritte, dieselbe Liste wie im Speaker-Portal. */
  next_open: string[] | null;
  updated_at: string;
  /** Seit Migration 0037 liest die RPC die Notiz auch zurück. */
  internal_notes: string | null;
};

/**
 * Felder, die nur das Team setzen darf — `update_speaker` antwortet sonst mit
 * 42501 `team_only_fields`. Die Oberfläche zeigt sie einem Manager gar nicht
 * erst, statt ihn in den Fehler laufen zu lassen.
 */
export const TEAM_ONLY = [
  "pass_type",
  "lounge_access",
  "hotel_tier",
  "hospitality_status",
] as const;

/**
 * Zwei Seiten statt einer (LEAD-028, Konrad 24.09.): die **Pipeline** ist das
 * CRM vor der Zusage — Ansprache bis Ja oder Nein, die Absage steht als Ergebnis
 * am Ende. **Bestätigte Speaker** ist das Onboarding danach; die Liste ist
 * dieselbe wie in `speaker_is_confirmed()`.
 */
export const PIPELINE_VOR_ZUSAGE = ["lead", "contacted", "declined"];
export const PIPELINE_BESTAETIGT = ["confirmed", "onboarded", "ready", "published", "attended"];
export type PipelineAnsicht = "pipeline" | "bestaetigt";

/** Reihenfolge der Pipeline in der Liste; `declined` steht am Ende. */
export const PIPELINE_ORDER = [
  "lead",
  "contacted",
  "confirmed",
  "onboarded",
  "ready",
  "published",
  "attended",
  "declined",
];
