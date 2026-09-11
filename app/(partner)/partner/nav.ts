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
  | "applicants"
  | "stage"
  | "shop";

export type NavInput = {
  products: readonly PartnerProduct[];
  /** Sessions mit `host_org_id` = Org (Masterclass, Company Tour …). */
  sessions_count: number;
  /** Bühne mit `partner_org_id` = Org. */
  has_stage: boolean;
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
    "shop",
  ];
  if (input.products.some((p) => p.category === "tickets")) keys.push("tickets");
  if (input.sessions_count > 0) keys.push("applicants");
  if (input.has_stage || input.products.some((p) => p.sku === STAGE_SKU)) keys.push("stage");
  return keys;
}
