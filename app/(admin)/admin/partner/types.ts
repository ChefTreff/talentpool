/** Zeilen der Admin-RPCs des Partnerbereichs (Kontrakt B9). */

export type AdminPartnerRow = {
  org_id: string;
  communication_name: string | null;
  legal_name: string | null;
  org_type: string | null;
  edition_id: string | null;
  onboarding_status: string;
  invited_at: string | null;
  onboarding_filled_at: string | null;
  contacts: number;
  primary_email: string | null;
  products: number;
  invoice_email: string | null;
  hubspot_deal_id: string | null;
  updated_at: string | null;
  deliverables_open: number;
  deliverables_submitted: number;
  deliverables_overdue: number;
  booth_number: string | null;
};

export type ReviewItem = {
  id: string;
  org_id: string;
  org_name: string | null;
  key: string;
  type: string;
  label_de: string | null;
  label_en: string | null;
  status: string;
  due_at: string | null;
  submitted_at: string | null;
  submitted_by_name: string | null;
  assets: {
    id: string;
    filename: string | null;
    mime: string | null;
    size_bytes: number | null;
    storage_path: string;
    status: string;
  }[];
  answers: Record<string, unknown> | null;
  review_note: string | null;
};

export type AdminAllocation = {
  id: string;
  org_id: string;
  org_name: string | null;
  edition_id: string;
  pass_type: string;
  quantity: number;
  used_count: number;
  coupon_code: string | null;
  undershop_url: string | null;
  status: string;
  last_error: string | null;
  synced_at: string | null;
  notes: string | null;
  vivenu_coupon_id: string | null;
  vivenu_undershop_id: string | null;
  updated_at: string | null;
};

export type AdminOrder = {
  id: string;
  order_no: string | null;
  org_id: string;
  org_name: string | null;
  edition_id: string;
  phase: number;
  status: string;
  note: string | null;
  internal_note: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  net_cents: number;
  vat_cents: number;
  gross_cents: number;
  lines: {
    sku: string;
    name_de: string | null;
    qty: number;
    price_net_cents: number;
    line_net_cents: number;
    unit: string | null;
    /** Merch-Konfiguration der Zeile (S4), `null` bei allem anderen. */
    merch_config: Record<string, unknown> | null;
  }[];
  created_at: string;
  updated_at: string;
};

export type AdminRequest = {
  id: string;
  org_id: string;
  org_name: string | null;
  product_sku: string | null;
  product_name: string | null;
  text: string;
  status: string;
  answer: string | null;
  created_by_name: string | null;
  created_at: string;
  answered_at: string | null;
};

export type ShopReportRow = {
  sku: string;
  name_de: string | null;
  category: string | null;
  unit: string | null;
  qty_total: number;
  net_total_cents: number;
  orders: number;
  orgs: number;
};

export type IngestLogRow = {
  kind: "sync_error" | "webhook";
  id: number;
  external_id: string | null;
  status: string | null;
  message: string | null;
  happened_at: string;
  payload: Record<string, unknown> | null;
  resolved: boolean;
};

/**
 * Eine Edition mit ihren Integrations-Kennungen. `hubspot_editions` liefert
 * nur Editionen, die bereits eine Pipeline haben, und kennt vivenu/Swapcard
 * nicht — deshalb liest die Seite `event` direkt (Lesen ist für Angemeldete
 * erlaubt, Schreiben nur über die drei `set_edition_*`-Funktionen).
 */
export type AdminEdition = {
  id: string;
  name: string | null;
  slug: string | null;
  start_date: string | null;
  hubspot_pipeline_id: string | null;
  hubspot_onboarding_stage_id: string | null;
  hubspot_done_stage_id: string | null;
  vivenu_event_id: string | null;
  swapcard_event_id: string | null;
};

/** `admin_products` gibt die Produktzeile unverändert heraus. */
export type AdminProduct = {
  sku: string;
  name_de: string | null;
  name_en: string | null;
  description_de: string | null;
  description_en: string | null;
  type: string | null;
  category: string | null;
  unit: string | null;
  net_price_cents: number | null;
  purchase_price_cents: number | null;
  margin: number | null;
  vat_rate: number | null;
  supplier: string | null;
  supplier_sku: string | null;
  supplier_url: string | null;
  stock_total: number | null;
  track_stock: boolean;
  available_until: string | null;
  shop_visible: boolean;
  shop_sort: number | null;
  late_orderable: boolean;
  shop_hint_de: string | null;
  shop_hint_en: string | null;
  purchase_note_de: string | null;
  purchase_note_en: string | null;
  internal_comment: string | null;
  /** Schema der Konfigurationsfelder (S4); `null` = kein Merch-Artikel. */
  merch_config: unknown;
  images: { url: string; name: string; path: string }[] | null;
  source_hubspot: boolean;
  source_shop: boolean;
  pass_type: string | null;
  grants_role: string | null;
  active: boolean;
  edition_id: string | null;
};

export type ProductComponent = {
  bundle_sku: string;
  component_sku: string;
  qty: number;
};

/** Zeile aus `deliverable_template`. */
export type AdminTemplate = {
  id: string;
  key: string;
  product_sku: string | null;
  category: string | null;
  type: string;
  label_de: string;
  label_en: string;
  description_de: string | null;
  description_en: string | null;
  due_rule: Record<string, unknown> | null;
  file_rules: Record<string, unknown> | null;
  required: boolean;
  audience_roles: string[] | null;
  sort: number | null;
  active: boolean;
  answers_schema: AnswerField[] | null;
  fulfilled_by_sku: string | null;
};

/** Ein Feld einer Formular-Pflicht (`deliverable_template.answers_schema`). */
export type AnswerField = {
  key: string;
  label_de: string | null;
  label_en: string | null;
  type: "text" | "textarea" | "select" | "number" | "boolean" | "date";
  required: boolean;
  options?: string[] | null;
};

export const ANSWER_FIELD_TYPES = [
  "text",
  "textarea",
  "select",
  "number",
  "boolean",
  "date",
] as const;

/** Ergebnis der beiden Trockenlauf-Routen. */
export type DryRunResult = {
  ok: boolean;
  job: number | null;
  dryRun?: boolean;
  candidates?: number;
  created?: number;
  errors?: number;
  rows?: number;
  events?: number;
  skipped?: string | null;
  error?: string;
  runs?: { org: string; outcome: string; detail?: string; orders?: string[]; net_cents?: number }[];
};

export const ONBOARDING_STATUS = ["none", "invited", "filled", "call_done"] as const;
export const ORDER_STATUS = ["pending", "editing", "completed", "cancelled"] as const;
export const ALLOCATION_STATUS = ["pending_vivenu", "active", "error", "disabled"] as const;
export const REQUEST_STATUS = ["open", "answered", "closed"] as const;
/** Arten einer Pflicht — Schema-Enum, kein Vokabular. */
export const DELIVERABLE_TYPES = [
  "upload",
  "form",
  "booking",
  "appointment",
  "info",
] as const;
