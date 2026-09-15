/** Zeile aus `edition_contacts_admin()` (Migration 0091). */
export type AdminKontakt = {
  id: string;
  type: string;
  display_name: string;
  role_label_de: string | null;
  role_label_en: string | null;
  email: string;
  phone: string;
  photo_path: string | null;
  is_default: boolean;
  sort_order: number;
  /** Wie viele Partner bzw. Speaker diesen Kontakt zugeordnet haben. */
  orgs: number;
  speakers: number;
};

/** Zeile aus `edition_infos_admin()`. */
export type AdminInfo = {
  id: string;
  key: string;
  audience: string[];
  label_de: string | null;
  label_en: string | null;
  value_de: string | null;
  value_en: string | null;
  sort_order: number;
};

export const CONTACT_TYPES = ["partner_lead", "partner_buddy", "speaker_lead", "speaker_buddy"] as const;
