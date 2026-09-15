import type { PartnerProduct } from "./types";

/**
 * Was ein Partner im Menü sieht, folgt aus den gebuchten Leistungen — nicht
 * aus Rollen und nicht aus manuellen Freischaltungen (Arbeitsauftrag C,
 * „Produktbasiert statt Rollen").
 *
 * Zwei Punkte hängen nicht am Produkt, sondern an dem, was daraus entstanden
 * ist (Review PR #14, Migration 0051): Bewerber gibt es, wenn der Org eine
 * Session zugeordnet wurde, Bühne, wenn ihr eine Bühne gehört. Über
 * Produktkategorien ginge beides schief — `stage_products` enthält auch reine
 * Speaking-Slots ohne Bewerbungsverfahren, und eine Bühne kann das Team auch
 * ohne passendes Produkt zuweisen.
 */

/** Standbühne als Produkt; die Bühne selbst kommt aus `has_stage`. */
export const STAGE_SKU = "I-79895";

export type PartnerNavKey =
  | "dashboard"
  | "onboarding"
  | "contacts"
  | "checklist"
  | "files"
  | "tickets"
  | "eventapp"
  | "booth"
  | "applicants"
  | "stage"
  | "shop"
  | "wiki";

export type NavInput = {
  products: readonly PartnerProduct[];
  /** Sessions mit `host_org_id` = Org (Masterclass, Company Tour …). */
  sessions_count: number;
  /** Bühne mit `partner_org_id` = Org. */
  has_stage: boolean;
  /** Stand mit Nummer, Maßen oder Rückwand — aus `partner_overview.booth`. */
  has_booth: boolean;
  /**
   * Kontingente aus `partner_overview.ticket_allocations`. Das Team kann eins
   * auch ohne passendes Produkt eintragen — dann gehört der Menüpunkt trotzdem
   * hin (Kontrakt B5–B9).
   */
  has_allocations: boolean;
};

/**
 * Alle Menüpunkte, die dieser Org zustehen. Ob es die Seite schon gibt,
 * entscheidet der Aufrufer — hier geht es nur um die Berechtigung.
 */
export function visibleNavKeys(input: NavInput): PartnerNavKey[] {
  const keys: PartnerNavKey[] = [
    // Ohne Produktbindung: wer eine Org-Edition hat, hat auch ein Dashboard,
    // Stammdaten, Kontakte, Checkliste und Dateien.
    "dashboard",
    "onboarding",
    "contacts",
    "checklist",
    "files",
    // Der Shop steht jedem Partner offen, sobald es die Edition gibt.
    // Die Bestellungen sind ein Reiter **im** Shop, kein eigener Menüpunkt:
    // sie gehören dorthin, wo bestellt wird (Konrad, 14.09.).
    "shop",
    // Die Event-App gilt für jeden Partner: jede Organisation steht in
    // Swapcard, und wer die Lead-Einstellung verpasst, kommt hinterher nicht
    // mehr an seine Kontakte. Den Punkt zu verstecken wäre teurer als ihn
    // jemandem zu zeigen, der ihn nicht braucht.
    "eventapp",
    // Das Wiki beantwortet, was ohnehin jeder fragt — keine Produktbindung.
    "wiki",
  ];
  if (input.has_allocations || input.products.some((p) => p.category === "tickets")) {
    keys.push("tickets");
  }
  // Messestand: wer Standfläche gebucht hat — oder wem das Team schon einen
  // Stand zugeordnet hat, auch ohne passendes Produkt (dieselbe Ausnahme wie
  // bei den Kontingenten).
  if (input.has_booth || input.products.some((p) => p.category === "standflaeche")) {
    keys.push("booth");
  }
  if (input.sessions_count > 0) keys.push("applicants");
  if (input.has_stage || input.products.some((p) => p.sku === STAGE_SKU)) keys.push("stage");
  return keys;
}
