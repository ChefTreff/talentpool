import type { Zielprofil } from "./profil";

/** Zeile aus `partner_company_tour` (0133, Tour Lead seit ADM-059): ein Stopp dieser Organisation. */
export type TourStopp = {
  stop_id: string;
  tour_id: string;
  tour_name: string;
  track: string | null;
  meeting_point: string | null;
  tour_starts_at: string | null;
  tour_ends_at: string | null;
  sort_order: number;
  arrival_at: string | null;
  departure_at: string | null;
  address: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  time_note: string | null;
  snacks: boolean | null;
  notes_public: string | null;
  target_profile: Zielprofil | null;
  photos_allowed: boolean | null;
  filled_at: string | null;
  lead_name: string | null;
  lead_role_de: string | null;
  lead_role_en: string | null;
  lead_email: string | null;
  lead_phone: string | null;
  lead_photo_path: string | null;
};

/** Was `partner_update_tour_stop` annimmt — dieselbe Liste wie die Whitelist der RPC. */
export type TourStoppFelder = {
  address: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  time_note: string;
  snacks: boolean | null;
  notes_public: string;
  target_profile: Zielprofil;
  photos_allowed: boolean | null;
};

export type TourStoppErgebnis = { ok: true } | { ok: false; key: string; detail?: string };

/** Höchstlänge der Hinweise, wie in `partner_update_tour_stop` (22023 `too_long`). */
export const HINWEISE_MAX = 1000;

/** Entwurf aus der gespeicherten Zeile; leere Felder als leerer Text, offene Fragen als `null`. */
export function tourEntwurf(x: TourStopp): TourStoppFelder {
  return {
    address: x.address ?? "",
    contact_name: x.contact_name ?? "",
    contact_email: x.contact_email ?? "",
    contact_phone: x.contact_phone ?? "",
    time_note: x.time_note ?? "",
    snacks: x.snacks,
    notes_public: x.notes_public ?? "",
    target_profile: x.target_profile ?? {},
    photos_allowed: x.photos_allowed,
  };
}

/**
 * Nur, was sich geändert hat — die RPC setzt `filled_at` bei jedem Aufruf, und
 * ein Speichern ohne Änderung soll keinen Eintrag im Audit erzeugen, der eine
 * Änderung behauptet. Ja/Nein-Fragen, die niemand beantwortet hat, gehen nicht
 * mit: `(null)::boolean` wäre in der RPC ein Fehler.
 */
export function tourAenderungen(vorher: TourStoppFelder, jetzt: TourStoppFelder): Record<string, unknown> {
  const felder: Record<string, unknown> = {};
  for (const k of ["address", "contact_name", "contact_email", "contact_phone", "time_note", "notes_public"] as const) {
    if (jetzt[k].trim() !== vorher[k].trim()) felder[k] = jetzt[k].trim();
  }
  for (const k of ["snacks", "photos_allowed"] as const) {
    if (jetzt[k] !== null && jetzt[k] !== vorher[k]) felder[k] = jetzt[k];
  }
  if (JSON.stringify(jetzt.target_profile) !== JSON.stringify(vorher.target_profile)) {
    felder.target_profile = jetzt.target_profile;
  }
  return felder;
}
