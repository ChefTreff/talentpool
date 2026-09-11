import type { FileRules } from "@/lib/partner/file-rules";

/** Zeile aus `my_partner_orgs()`. */
export type PartnerOrg = {
  org_id: string;
  communication_name: string | null;
  legal_name: string | null;
  org_type: string | null;
  roles: string[];
  edition_id: string;
  edition_name: string | null;
  edition_slug: string | null;
  onboarding_status: string;
};

/**
 * `partner_overview()`. Felder mit `*` im Kontrakt (Rechnungsdaten) liefert die
 * RPC nur den Rollen, die sie sehen dürfen — sonst stehen sie auf `null`.
 */
export type PartnerOverview = {
  org: {
    id: string;
    legal_name: string | null;
    communication_name: string | null;
    type: string | null;
    website: string | null;
    description: string | null;
    logo_dark: string | null;
    logo_light: string | null;
    address: {
      street: string | null;
      zip: string | null;
      city: string | null;
      country: string | null;
    };
    partner_category: string | null;
  };
  roles: string[];
  team: boolean;
  edition: {
    id: string;
    edition_id: string;
    onboarding_status: string;
    invited_at: string | null;
    onboarding_filled_at: string | null;
    description_de: string | null;
    description_en: string | null;
    invoice_email: string | null;
    invoice_name: string | null;
    vat_id: string | null;
    po_number: string | null;
    pass_type_choice: string | null;
    sponsoring_level: string | null;
  };
  contacts_count: number;
  products: PartnerProduct[];
  ticket_allocations: {
    id: string;
    pass_type: string;
    quantity: number;
    coupon_code: string | null;
    undershop_url: string | null;
    used_count: number;
  }[];
  deadlines: PartnerDeadline[];
  booth: {
    booth_number: string | null;
    booth_type: string | null;
    segment: string | null;
    length_m: number | null;
    width_m: number | null;
    backdrop_w_mm: number | null;
    backdrop_h_mm: number | null;
  } | null;
  checklist: {
    total: number;
    done: number;
    open: number;
    rejected: number;
    overdue: number;
    next_due: string | null;
  };
};

export type PartnerProduct = {
  sku: string;
  name_de: string | null;
  name_en: string | null;
  category: string | null;
  type: string | null;
  qty: number;
  unit_price_cents: number | null;
  status: string;
};

export type PartnerDeadline = {
  key: string;
  due_at: string | null;
  label_de: string | null;
  label_en: string | null;
  description_de: string | null;
  description_en: string | null;
};

/** Zeile aus `partner_contacts()`. */
export type PartnerContact = {
  person_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  contact_position: string | null;
  roles: string[];
  has_login: boolean;
  invited_at: string | null;
};

/** Zeile aus `my_deliverables()`. */
export type Deliverable = {
  id: string;
  key: string;
  type: "upload" | "form" | "booking" | "appointment" | "info";
  label_de: string | null;
  label_en: string | null;
  description_de: string | null;
  description_en: string | null;
  product_sku: string | null;
  product_name_de: string | null;
  product_name_en: string | null;
  status: "open" | "submitted" | "accepted" | "rejected" | "overdue";
  due_at: string | null;
  submitted_at: string | null;
  review_note: string | null;
  required: boolean;
  file_rules: FileRules;
  answers: Record<string, unknown>;
  assets: DeliverableAsset[];
  sort: number;
};

export type DeliverableAsset = {
  id: string;
  filename: string | null;
  mime: string | null;
  size_bytes: number | null;
  status: string;
  version: number;
  storage_path: string;
  created_at: string;
};

/**
 * Kontaktrollen (Entscheidung 1). `accounting` fehlt mit Absicht: die
 * Rechnungs-E-Mail ist kein Login, sie steht in `org_edition.invoice_email`.
 */
export const CONTACT_ROLES = [
  "primary_ops",
  "additional",
  "signing",
  "event_app_member",
] as const;

export type ContactRole = (typeof CONTACT_ROLES)[number];

/** Rollen, die Stammdaten und Uploads ändern dürfen (Kontrakt B1–B4). */
const EDITORS: readonly string[] = ["primary_ops", "additional", "signing"];

export function canEditOnboarding(roles: readonly string[], team: boolean): boolean {
  return team || roles.some((r) => EDITORS.includes(r));
}

/** Mitglieder verwalten darf nur der Hauptkontakt — oder das Team. */
export function canManageContacts(roles: readonly string[], team: boolean): boolean {
  return team || roles.includes("primary_ops");
}

export const PASS_TYPES = ["talent", "startup"] as const;

/** Name einer Org fürs Menü: Kommunikationsname vor Firmenname. */
export function orgLabel(org: Pick<PartnerOrg, "communication_name" | "legal_name">): string {
  return org.communication_name || org.legal_name || "—";
}
