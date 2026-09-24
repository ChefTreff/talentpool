/**
 * Kontakte einer Partner-Organisation — was Partnerportal und Admin teilen.
 *
 * Eine eigene Datei ohne `"use client"`: die Konstanten lesen auch Server-
 * Komponenten, und aus einem Client-Modul käme dort nur ein Verweis an, keine Liste.
 */

/** Zeile aus `partner_contacts()`. */
export type ContactRow = {
  person_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  contact_position: string | null;
  roles: string[];
  has_login: boolean;
  invited_at: string | null;
  /**
   * Name und Adresse darf die Organisation pflegen: sie hat die Person selbst
   * angelegt, und die Person hat sich noch nie angemeldet (PART-062, Regel wie
   * bei den Speakern in 0139). Position und Rollen sind davon unabhängig.
   */
  editable: boolean;
};

/**
 * Rollen, die die Liste anbietet, in dieser Reihenfolge. Die Bezeichnungen
 * kommen aus dem Vokabular `contact_role` — dort pflegt das Team den Wortlaut,
 * nicht im Code. Andere Rollen (etwa `accounting` aus dem HubSpot-Ingest)
 * bleiben beim Speichern erhalten, stehen aber nicht zur Auswahl.
 */
export const CONTACT_ROLES = ["primary_ops", "additional", "cc", "signing", "event_app_member"] as const;

export type ContactRole = (typeof CONTACT_ROLES)[number];

export type ContactActionResult = { ok: true } | { ok: false; key: string; detail?: string };

export type InviteContactInput = {
  orgId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  position: string;
};

export type UpdateContactInput = {
  orgId: string;
  personId: string;
  position: string;
  roles: string[];
  /** `null` heisst „unverändert" — so schickt die Liste es bei nicht pflegbaren Personen. */
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

/**
 * Die Server-Actions, mit denen die Liste arbeitet. Partnerportal und Admin
 * reichen je ihre eigenen herein (anderes Gate, andere Pfade zum Neuladen);
 * die RPCs dahinter sind dieselben.
 */
export type ContactActions = {
  invite: (input: InviteContactInput) => Promise<ContactActionResult>;
  update: (input: UpdateContactInput) => Promise<ContactActionResult>;
  remove: (orgId: string, personId: string) => Promise<ContactActionResult>;
  transferPrimary: (orgId: string, personId: string) => Promise<ContactActionResult>;
};

/**
 * `cc` schliesst die operativen Rollen aus: wer mitarbeitet (Hauptkontakt,
 * weiterer operativer Kontakt), bekommt die Mails ohnehin selbst und stünde
 * sonst doppelt drin (PART-063). Die Datenbank lässt solche Personen aus der
 * Kopie weg; die Auswahl zeigt es gleich richtig an.
 */
const SCHLIESST_AUS: Record<string, readonly string[]> = {
  cc: ["additional", "primary_ops"],
  additional: ["cc"],
  primary_ops: ["cc"],
};

export function toggleContactRole(roles: readonly string[], role: string): string[] {
  if (roles.includes(role)) return roles.filter((r) => r !== role);
  const weg = SCHLIESST_AUS[role] ?? [];
  return [...roles.filter((r) => !weg.includes(r)), role];
}
