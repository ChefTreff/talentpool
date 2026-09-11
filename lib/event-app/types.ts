/**
 * Event-App-Adapter (Welle 3 A12, Entscheidung 13: Swapcard bleibt 2027, Eigenbau/Conferras wird für 2028 evaluiert).
 * Der Portal-Code spricht nur diesen Vertrag; Swapcard ist eine Implementierung (`lib/event-app/swapcard`).
 * Umfang in Welle 3: Aussteller (Name, Beschreibung, Website, Logo, Typ = Sponsoring-Level). Personen, Sessions und Mitglieder folgen in Welle 4/5.
 */

/** Zeile aus `event_app_exhibitors(p_edition_id?)` (Migration 0055). */
export type ExhibitorRow = {
  org_edition_id: string;
  org_id: string;
  edition_id: string;
  edition_slug: string;
  swapcard_event_id: string | null;
  name: string;
  legal_name: string;
  slug: string | null;
  description_de: string | null;
  description_en: string | null;
  website: string | null;
  sponsoring_level: string | null;
  partner_category: string | null;
  org_type: string | null;
  booth_number: string | null;
  onboarding_status: string;
  logo_path: string | null;
  logo_mime: string | null;
  swapcard_exhibitor_id: string | null;
  members: { person_id: string; first_name: string | null; last_name: string | null; email: string | null; position: string | null }[];
};

/** Was der Adapter je Aussteller anlegt oder aktualisiert — systemneutral und bewusst schmal. `clientId` ist unsere Org-ID. */
export type ExhibitorUpsert = {
  clientId: string;
  name: string;
  description?: string;
  websiteUrl?: string;
  logoUrl?: string;
  type?: string;
  booth?: string;
};

/** Aussteller, wie ihn die App zurückgibt. */
export type RemoteExhibitor = {
  id: string;
  name: string;
  clientIds?: string[];
  description?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  type?: string | null;
};

export interface EventAppAdapter {
  readonly system: "swapcard";
  listExhibitors(eventId: string): Promise<RemoteExhibitor[]>;
  upsertExhibitors(eventId: string, items: ExhibitorUpsert[]): Promise<RemoteExhibitor[]>;
  deleteExhibitors(eventId: string, ids: string[]): Promise<void>;
}
