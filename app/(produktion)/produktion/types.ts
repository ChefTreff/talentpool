/** Zeilen der Produktions-RPCs (Migration 0082). */

export type RegieCue = {
  cue_id: string;
  cue_start: string;
  cue_end: string;
  sort_order: number;
  action: string;
  umbau_min: number | null;
  moderation: string | null;
  regie: string | null;
  backstage: string | null;
  mobiliar: string | null;
  notes: string | null;
  mic_assignments: Record<string, unknown>;
  media: Record<string, unknown>;
  slot_id: string | null;
  slot_status: string | null;
  session_id: string | null;
  title: string | null;
  format: string | null;
  speakers: { person_id: string; first_name: string | null; last_name: string | null }[] | null;
};

export type OpenSlot = {
  slot_id: string;
  start_at: string;
  end_at: string;
  title: string | null;
  format: string | null;
};

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
