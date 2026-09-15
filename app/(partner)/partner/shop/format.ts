import type { ShopOrder, ShopProduct } from "../types";

/**
 * Darstellung, die Server **und** Browser brauchen.
 *
 * Bewusst ohne `server-only`: `load.ts` darf das nicht sein, weil die
 * Warenkorb-Komponente im Browser dieselbe Preisformatierung und dieselbe
 * Bestandsschwelle benutzt wie der Katalog auf dem Server.
 */

/** Netto in Euro — Preise sind im Shop immer netto (Arbeitsauftrag C). */
export function money(cents: number, dateLocale: string): string {
  return (cents / 100).toLocaleString(dateLocale, { style: "currency", currency: "EUR" });
}

/**
 * Ab wann der Bestand genannt wird.
 *
 * Die Schwelle ist Sache der Oberfläche (Entscheid 5 der Architektur-Session).
 * Zehn ist bewusst niedrig: eine Zahl an jedem Artikel liest sich wie ein
 * Lagerbericht, eine Zahl bei den letzten Stücken wie ein Hinweis.
 */
export const STOCK_HINT_FROM = 10;

export function stockHint(
  p: Pick<ShopProduct, "track_stock" | "stock_available">,
): { kind: "sold_out" } | { kind: "low"; n: number } | null {
  if (!p.track_stock) return null;
  const n = p.stock_available ?? 0;
  if (n <= 0) return { kind: "sold_out" };
  if (n <= STOCK_HINT_FROM) return { kind: "low", n };
  return null;
}

/**
 * Wie viele Stück liegen im Warenkorb — die Zahl am Knopf oben rechts.
 *
 * Gezählt werden **Positionen**, nicht Stück: „3" neben dem Korb heisst in
 * jedem Shop „drei verschiedene Dinge", nicht „drei Barhocker".
 */
export function cartCount(cart: ShopOrder | null): number {
  return cart?.lines.length ?? 0;
}
