/** Eine Reception in der Team-Sicht (`receptions_admin`, Migration 0125). */
export type ReceptionRow = {
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
  rsvp_deadline: string | null;
  published: boolean;
  /** Belegte **Plätze** — Zusagen plus Begleitungen. */
  taken: number;
  yes_count: number;
  no_count: number;
  /** Wie viele dürften kommen? Der Nenner zum Rücklauf. */
  invited_count: number;
};

/** Eine Zeile der Gästeliste (`reception_guests`). */
export type ReceptionGuest = {
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  guests: number;
  note: string | null;
  responded_at: string;
};

/** Die Felder des Formulars, in der Reihenfolge der Eingabe. */
export const RECEPTION_FIELDS = [
  { key: "title_de", kind: "text", required: true, wide: false },
  { key: "title_en", kind: "text", required: true, wide: false },
  { key: "location", kind: "text", required: true, wide: false },
  { key: "address", kind: "text", required: false, wide: false },
  { key: "starts_at", kind: "datetime-local", required: true, wide: false },
  { key: "ends_at", kind: "datetime-local", required: false, wide: false },
  { key: "capacity", kind: "number", required: false, wide: false },
  { key: "rsvp_deadline", kind: "datetime-local", required: false, wide: false },
] as const;
