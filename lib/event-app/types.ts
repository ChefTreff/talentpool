/**
 * Event-App-Adapter (Welle 3 A12, Entscheidung 13: Swapcard bleibt 2027, Eigenbau/Conferras wird für 2028 evaluiert).
 * Der Portal-Code spricht nur diesen Vertrag; Swapcard ist eine Implementierung (`lib/event-app/swapcard`).
 * Umfang in Welle 3: Aussteller (Name, Beschreibung DE/EN, Website, Logo, Standnummer). Personen, Sessions und Mitglieder folgen in Welle 4/5.
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
  /** Freigegebenes SVG (Website, Druck) und PNG (Event-App) — aktuelle Fassung der akzeptierten Pflicht; 0057. */
  logo_svg_path: string | null;
  logo_png_path: string | null;
  logo_png_asset_id: string | null;
  swapcard_exhibitor_id: string | null;
  members: { person_id: string; first_name: string | null; last_name: string | null; email: string | null; position: string | null }[];
};

/**
 * Was der Adapter je Aussteller anlegt oder aktualisiert — systemneutral und bewusst schmal. `clientId` ist unsere Org-ID;
 * `existingId` verweist auf einen Aussteller, den die App schon kennt (etwa aus dem Vorjahr) — dann wird er aktualisiert statt verdoppelt.
 */
export type ExhibitorUpsert = {
  clientId: string;
  name: string;
  description?: string;
  descriptionEn?: string;
  websiteUrl?: string;
  logoUrl?: string;
  type?: string;
  booth?: string;
  existingId?: string;
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

/** Ergebnis eines Upserts: je Eingabe (`inputId` = clientId) der Aussteller oder ein Prüf-Fehler. */
export type UpsertOutcome = {
  results: { inputId: string; exhibitor: RemoteExhibitor }[];
  errors: { inputId: string; code: string; message: string; path: string[] }[];
};

export interface EventAppAdapter {
  readonly system: "swapcard";
  /** Aussteller des Events oder der ganzen Community (dort liegen auch die Vorjahre). */
  listExhibitors(eventId: string, scope?: "event" | "community"): Promise<RemoteExhibitor[]>;
  /** `validateOnly` lässt die App prüfen, ohne zu schreiben (Trockenlauf mit echter Validierung). */
  upsertExhibitors(eventId: string, items: ExhibitorUpsert[], opts?: { validateOnly?: boolean }): Promise<UpsertOutcome>;
  deleteExhibitors(eventId: string, ids: string[]): Promise<void>;
}
