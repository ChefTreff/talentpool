/** Zeilen der Produktions-RPCs (Migration 0082). */

// Regie-Typen liegen seit 0101 geteilt in `components/regie/types.ts`.
export type { RegieCue, OpenSlot } from "@/components/regie/types";

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
};

export type SupplierRow = {
  supplier: string;
  product_sku: string;
  product_name: string;
  unit: string | null;
  qty: number;
  orgs: number;
  purchase_price_cents: number | null;
};
