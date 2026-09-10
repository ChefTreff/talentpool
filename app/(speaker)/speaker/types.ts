/**
 * Das JSON aus `my_speaker_profile()`. Die RPC entscheidet, was eine Person
 * sehen darf — die Oberfläche rechnet nichts nach, sie stellt dar.
 */
export type SpeakerPerson = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  pronouns: string | null;
  photo_url: string | null;
  linkedin_url: string | null;
  preferred_language: string | null;
  phone_e164: string | null;
  email: string | null;
};

export type SpeakerAssistant = {
  person_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

/** Was noch offen ist. `open` ist die Reihenfolge, in der es angepackt gehört. */
export type NextSteps = {
  profile: boolean;
  photo: boolean;
  consents: boolean;
  session: boolean | null;
  session_content: boolean | null;
  presentation: boolean | null;
  ticket: boolean;
  hospitality: string;
  open: string[];
};

export type SpeakerProfile = {
  id: string;
  edition_id: string;
  edition_name: string | null;
  /** Sieht gerade die Assistenz zu, nicht der Speaker selbst? */
  is_assistant: boolean;
  speaker_type: string;
  pipeline_status: string;
  job_title: string | null;
  organization_name: string | null;
  bio_short_en: string | null;
  bio_short_de: string | null;
  bio_long_en: string | null;
  bio_long_de: string | null;
  socials: Record<string, string> | null;
  tech_rider: Record<string, unknown> | null;
  reception_eligible: boolean;
  lounge_access: boolean;
  pass_type: string;
  hotel_tier: string;
  hospitality_status: string;
  travel_costs_covered: boolean;
  travel_costs_approved: boolean;
  invited_at: string | null;
  assistant: SpeakerAssistant | null;
  person: SpeakerPerson;
  consents: Record<string, boolean>;
  next_steps: NextSteps;
};

/** Die vier Einwilligungen, die das Speaker-Portal führt. */
export const SPEAKER_CONSENTS = [
  "photo_video",
  "speaker_release",
  "slides_publication",
  "hospitality_data",
] as const;

/**
 * Schritte aus `next_steps.open` und ihr Ziel. `null` heißt: die Seite gibt es
 * noch nicht (Foto braucht den Upload aus B2/A4, Ticket kommt mit B5) — die
 * Karte sagt das, statt ins Leere zu verlinken.
 */
export const STEP_HREF: Record<string, string | null> = {
  profile: "/speaker/profil",
  consents: "/speaker/profil#consent",
  photo: null,
  session: "/speaker/session",
  session_content: "/speaker/session",
  presentation: "/speaker/session",
  ticket: null,
};
