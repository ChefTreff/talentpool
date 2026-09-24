/**
 * Das JSON aus `my_speaker_profile()`. Die RPC entscheidet, was eine Person
 * sehen darf — die Oberfläche rechnet nichts nach, sie stellt dar.
 */
export type SpeakerPerson = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
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
  /**
   * Kontakt ohne Portalzugang (0127): Agentur, Office oder Management.
   *
   * `null`, solange nichts hinterlegt ist. Bewusst **kein** Personendatensatz —
   * die Person soll im Portal nichts tun, und ein ungenutztes Konto wäre mehr
   * Datenhaltung, nicht weniger.
   */
  contact: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    kind: string | null;
    consent_at: string | null;
  } | null;
  /**
   * Alle Kontakte aus `speaker_contact` (0148) — Assistenz, Agentur, Office in
   * einer Liste. Löst `contact` und `assistant` ab; die beiden bleiben, bis
   * eine spätere Migration die alten Spalten entfernt.
   */
  contacts: SpeakerContact[];
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
 * Schritte aus `next_steps.open` und ihr Ziel. `null` hiesse: die Seite gibt es
 * noch nicht — die Karte sagt das dann, statt ins Leere zu verlinken.
 *
 * Seit SPK-004 hat auch `photo` ein Ziel. Vorher stand der Schritt in der
 * Aufgabenliste, ohne dass man ihn erledigen konnte: ein offener Punkt, den
 * niemand abhaken kann, ist schlimmer als gar keiner.
 */
export const STEP_HREF: Record<string, string | null> = {
  profile: "/speaker/profil",
  consents: "/speaker/profil#consent",
  photo: "/speaker/profil#foto",
  session: "/speaker/session",
  session_content: "/speaker/session",
  presentation: "/speaker/session",
  ticket: "/speaker/tickets",
};

/** Der Bucket aller Speaker-Dateien: Präsentationen, Fotos, Sonstiges. */
export const SPEAKER_BUCKET = "speaker-assets";

/** Was der Foto-Upload annimmt (SPK-004). */
export const PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * Dateinamen für den Objektschlüssel entschärfen: Storage mag keine Pfad-
 * trenner und keine Sonderzeichen, und der Name landet 1:1 im Schlüssel.
 * Der Originalname wird daneben in `speaker_asset.filename` gespeichert.
 */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "");
  return (cleaned || "datei").slice(-80);
}

/** Eine Reception in der Speaker-Sicht (`my_receptions`, Migration 0125). */
export type MyReception = {
  id: string;
  title_de: string;
  title_en: string;
  description_de: string | null;
  description_en: string | null;
  location: string;
  address: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  taken: number;
  /** Freie Plätze — `null`, wenn es keine Obergrenze gibt. */
  free: number | null;
  rsvp_deadline: string | null;
  closed: boolean;
  my_status: string | null;
  my_guests: number | null;
  my_note: string | null;
};

/**
 * Welche Aufgabe der Checkliste an welcher Frist hängt (SPK-024).
 *
 * Gepflegt wird die Frist im Admin unter „Fristen"; hier steht nur, welcher
 * Schlüssel zu welchem Schritt gehört. Was hier fehlt, hat schlicht keine
 * Frist — dann zeigt die Liste auch keine.
 */
export const FRIST_KEY: Record<string, string> = {
  presentation: "presentation_upload",
};

/**
 * Eine Aufgabe aus `speaker_task` samt eigenem Haken (`my_speaker_tasks`,
 * 0149) — die Punkte, die das Portal nicht selbst beobachten kann.
 */
export type SpeakerTask = {
  id: string;
  key: string;
  label_de: string;
  label_en: string;
  description_de: string | null;
  description_en: string | null;
  /** Schlüssel einer Frist aus `deadline`, oder `null`. */
  deadline_key: string | null;
  done_at: string | null;
};

/**
 * Ein Kontakt einer Speakerin (`speaker_contact`, 0148) — Assistenz, Agentur,
 * Office. `has_access` sagt, ob die Person sich anmelden darf.
 */
export type SpeakerContact = {
  id: string;
  kind: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  has_access: boolean;
  consent_at: string | null;
  /** Ob die eingeladene Person schon ein Konto hat. */
  signed_in: boolean | null;
};
