import type { PartnerProduct } from "./types";

/**
 * Was ein Partner im Menü sieht, folgt aus den gebuchten Leistungen — nicht
 * aus Rollen und nicht aus manuellen Freischaltungen (Arbeitsauftrag C,
 * „Produktbasiert statt Rollen").
 *
 * Die Regel steht hier vollständig, obwohl PR 1 nur die Seiten ohne
 * Produktbindung mitbringt: so entscheidet später eine geprüfte Funktion und
 * nicht eine Bedingung, die jemand in der Sidebar nachbaut.
 */

/** Standbühne — das Produkt steht im Kontrakt namentlich. */
export const STAGE_SKU = "I-79895";

/** Formate mit Bewerbungsverfahren (Masterclass, Company Tour). */
const FORMAT_CATEGORIES = ["masterclass", "company_tour", "formate"];

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

/**
 * Alle Menüpunkte, die dieser Org zustehen. Ob es die Seite schon gibt,
 * entscheidet der Aufrufer — hier geht es nur um die Berechtigung aus den
 * Produkten.
 */
export function visibleNavKeys(products: readonly PartnerProduct[]): PartnerNavKey[] {
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
  if (products.some((p) => p.category === "tickets")) keys.push("tickets");
  if (products.some((p) => FORMAT_CATEGORIES.includes(p.category ?? ""))) {
    keys.push("applicants");
  }
  if (products.some((p) => p.sku === STAGE_SKU)) keys.push("stage");
  return keys;
}
