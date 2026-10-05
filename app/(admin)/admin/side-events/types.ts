export type InviteStatus = "invited" | "yes" | "no";
export type InviteVia = "portal" | "email" | "team";

/** Ein Side Event in der Team-Sicht (`side_events_admin`, ADM-077). */
export type SideEventRow = {
  id: string;
  edition_id: string;
  title_de: string;
  title_en: string;
  description_de: string | null;
  description_en: string | null;
  location: string;
  address: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  /** Antwortfrist (optional): bis dahin antworten Speaker, sonst bis zum Beginn. */
  rsvp_deadline: string | null;
  published: boolean;
  /** Belegte **Plätze** — Zusagen plus Begleitungen. */
  taken: number;
  yes_count: number;
  no_count: number;
  /** Eingeladen, noch ohne Antwort. */
  open_count: number;
  /** Alle Einladungen — der Nenner zum Rücklauf. */
  invited_count: number;
};

/** Eine Einladung samt Antwort — kommt **auf Klick** (`side_events_admin` mit Event-Id), nicht mit der Seite: Namen und Hinweise sind Personendaten. */
export type SideEventInvite = {
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  status: InviteStatus;
  guests: number;
  note: string | null;
  via: InviteVia;
  invited_at: string;
  mailed_at: string | null;
  responded_at: string | null;
};

/** Ein bestätigter Speaker, den man einladen kann (Auswahl im Einladungsfenster). */
export type SpeakerAuswahl = { id: string; label: string };

/** Ergebnis von `invite_to_side_event`. */
export type InviteResult = {
  invited: number;
  resent: number;
  skipped: { profile_id: string; reason: string }[];
  /** Eingeladen, aber ohne Mail (keine zustellbare Adresse): die Person sieht die Einladung im Portal. */
  no_mail: string[];
};

/** Die Felder des Formulars, in der Reihenfolge der Eingabe. */
export const SIDE_EVENT_FIELDS = [
  { key: "title_de", kind: "text", required: true },
  { key: "title_en", kind: "text", required: true },
  { key: "location", kind: "text", required: true },
  { key: "address", kind: "text", required: false },
  { key: "starts_at", kind: "datetime-local", required: true },
  { key: "ends_at", kind: "datetime-local", required: false },
  { key: "capacity", kind: "number", required: false },
  { key: "rsvp_deadline", kind: "datetime-local", required: false },
] as const;

/** Schlüssel der Frist, die den Platzhalter im Speaker-Portal steuert („Side Events werden am … veröffentlicht“). */
export const PLATZHALTER_FRIST = "side_events_publish";
