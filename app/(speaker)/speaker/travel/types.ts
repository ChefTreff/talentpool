/** Zeile aus `hospitality_options()`. */
export type HospitalityOption = {
  quota_id: string;
  kind: "hotel" | "shuttle";
  tier: string | null;
  label_de: string | null;
  label_en: string | null;
  description_de: string | null;
  description_en: string | null;
  location: string | null;
  capacity: number;
  used: number;
  free: number;
  window_from: string | null;
  window_to: string | null;
  /** Darf gerade gebucht werden? Sonst sagt `block_reason`, woran es liegt. */
  eligible: boolean;
  block_reason: "status" | "consent" | "declined" | null;
  my_booking: MyBookingShort | null;
};

export type MyBookingShort = {
  id: string;
  status: string;
  guests: number;
  details: Record<string, string> | null;
  created_at: string;
  confirmed_at: string | null;
  team_note: string | null;
};

/** Zeile aus `my_hospitality()`. */
export type HospitalityBooking = {
  id: string;
  quota_id: string;
  kind: string;
  tier: string | null;
  label_de: string | null;
  label_en: string | null;
  location: string | null;
  window_from: string | null;
  window_to: string | null;
  status: string;
  guests: number;
  details: Record<string, string> | null;
  team_note: string | null;
  created_at: string;
  confirmed_at: string | null;
};

/**
 * Welche Angaben eine Buchung braucht. Die RPC nimmt `details` frei entgegen;
 * diese Liste ist der Vorschlag aus dem Arbeitsauftrag, damit das Team überall
 * dieselben Schlüssel vorfindet.
 */
export const DETAIL_FIELDS: Record<string, { key: string; kind: "date" | "text" | "area" }[]> = {
  hotel: [
    { key: "check_in", kind: "date" },
    { key: "check_out", kind: "date" },
    { key: "room_type", kind: "text" },
    { key: "special", kind: "area" },
  ],
  shuttle: [
    { key: "pickup_location", kind: "text" },
    { key: "arrival_info", kind: "area" },
  ],
};
