/**
 * Event-App-Adapter (Welle 3 A12, Entscheidung 13: Swapcard bleibt 2027, Eigenbau/Conferras wird für 2028 evaluiert).
 * Der Portal-Code spricht nur diesen Vertrag; Swapcard ist eine Implementierung (`lib/event-app/swapcard`).
 * Umfang in Welle 3: Aussteller (Name, Beschreibung DE/EN, Website, Logo, Standnummer). Personen, Sessions und Mitglieder folgen in Welle 4/5.
 * EA1 (21.09.2026): Abnahme gegen das 27er-Event; Level und Kategorie kommen aus den gebuchten Produkten (0135) und bleiben vorerst im Portal.
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
  /** Schlüssel und Rang aus dem Vokabular `sponsoring_level` (0097): z. B. `premium`/40; unbekanntes Level ⇒ Schlüssel normalisiert, Rang null. */
  sponsoring_key: string | null;
  sponsoring_rank: number | null;
  /** Abgeleitetes Level (0135): bestes Level unter den gebuchten Produkten, sonst der HubSpot-Freitext. */
  level_key: string | null;
  level_rank: number | null;
  /** `product` = aus den gebuchten Produkten, `hubspot` = Freitext vom Deal, `null` = nichts bekannt. */
  level_source: "product" | "hubspot" | null;
  /** Produktkategorien der gebuchten **Pakete**, in Vokabular-Reihenfolge (0135). Leeres Array, nie null. */
  categories: string[];
  /** Branche aus dem Vokabular `industry` (0138) — Schlüssel = Optionswert des Swapcard-Feldes „Branche". */
  industry: string | null;
  /** Kategorie der Logo-Wand (0139). Nie null: wer keine Stufe trägt, ist `official_partner`. */
  sponsor_category: string;
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
  /** Branche. In Swapcard heisst das Feld `type`; der Wert ist der Optionswert von „Branche" (`tech-and-it` …), nicht das Sponsoring-Level. */
  industry?: string;
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
  /** In Swapcard ist `type` die **Branche** — beim Lesen als Beschriftung („Tech, Data & IT"), Probe 21.09.2026. */
  type?: string | null;
  /** Derselbe Wert als Optionsschlüssel (`tech-and-it`). Nur der lässt sich mit unserem Vokabular vergleichen. */
  typeValue?: string | null;
  /** Standnummern im abgefragten Event; nur gesetzt, wenn der Aussteller schon am Event hängt. */
  booths?: string[];
};

/** Ergebnis eines Upserts: je Eingabe (`inputId` = clientId) der Aussteller oder ein Prüf-Fehler. */
export type UpsertOutcome = {
  results: { inputId: string; exhibitor: RemoteExhibitor }[];
  errors: { inputId: string; code: string; message: string; path: string[] }[];
};

export interface EventAppAdapter {
  readonly system: "swapcard";
  /** Aussteller des Events oder der ganzen Community (dort liegen auch die Vorjahre). Im Scope `event` kommen die Standnummern mit. */
  listExhibitors(eventId: string, scope?: "event" | "community"): Promise<RemoteExhibitor[]>;
  /** `validateOnly` lässt die App prüfen, ohne zu schreiben (Trockenlauf mit echter Validierung). */
  upsertExhibitors(eventId: string, items: ExhibitorUpsert[], opts?: { validateOnly?: boolean }): Promise<UpsertOutcome>;
  deleteExhibitors(eventId: string, ids: string[]): Promise<void>;
}

/** Eine Kategorie der Logo-Wand, wie die App sie führt. */
export type RemoteSponsorCategory = { id: string; name: string };

/** Ein Eintrag auf der Logo-Wand. `name` ist bei Alteinträgen aus dem Vorjahr leer. */
export type RemoteSponsor = {
  id: string;
  name: string;
  logoUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
};

/** Was der Adapter je Logo anlegt oder ändert. */
export type SponsorUpsert = {
  /** Unsere Org×Edition — nur zur Zuordnung im Protokoll, Swapcard kennt sie nicht. */
  orgEditionId: string;
  name: string;
  categoryId: string;
  logoUrl: string;
  redirectUrl?: string;
  /** Vorhandener Eintrag, den wir selbst angelegt haben (aus `external_ref`). */
  existingId?: string;
};
