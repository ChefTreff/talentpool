/** Zeilen der Produktions-RPCs (Migration 0082, erweitert um PROD-004/005). */

// Regie-Typen liegen seit 0101 geteilt in `components/regie/types.ts`.
export type { RegieCue, OpenSlot } from "@/components/regie/types";

/**
 * Eine Position der Produktionsliste eines Stands (`booth_checklist`).
 * `qty` ist die Summe aus Paketausstattung, Angebot und Messeshop; wie sie
 * sich zusammensetzt, steht in den drei `qty_*`-Feldern. `qty_shop_open` ist
 * der Teil des Shops, der noch nicht abgeschlossen ist (`pending`/`editing`).
 */
export type BoothItem = {
  org_edition_id: string;
  org_id: string;
  org_name: string;
  booth_number: string | null;
  product_sku: string;
  product_name: string;
  supplier: string | null;
  qty: number;
  checked: boolean;
  checked_at: string | null;
  checked_by_name: string | null;
  note: string | null;
  unit: string | null;
  qty_package: number;
  qty_offer: number;
  qty_shop: number;
  qty_shop_open: number;
};

export type SupplierRow = {
  supplier: string;
  product_sku: string;
  product_name: string;
  unit: string | null;
  qty: number;
  orgs: number;
  purchase_price_cents: number | null;
  qty_package: number;
  qty_offer: number;
  qty_shop: number;
  qty_shop_open: number;
};

/** Ein Prüfpunkt eines Stands (Vokabular `booth_review_item`). `status` leer = offen. */
export type BoothReview = {
  item_key: string;
  label_de: string;
  label_en: string;
  status: "ok" | "problem" | null;
  note: string | null;
  checked_at: string | null;
  checked_by_name: string | null;
  /** Die Bestellung hat sich seit der Prüfung geändert. */
  stale: boolean;
};

/** Ein Stand mit Maßen, gebuchter Fläche und seinen Prüfpunkten (`booth_production_summary`). */
export type BoothSummary = {
  org_edition_id: string;
  org_id: string;
  org_name: string;
  booth_number: string | null;
  booth_length_m: number | null;
  booth_width_m: number | null;
  stand_sqm: number | null;
  stand_days: number | null;
  package_names: string | null;
  reviews: BoothReview[];
};
