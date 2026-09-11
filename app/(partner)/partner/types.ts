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
  ticket_allocations: TicketAllocation[];
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
  /** Sessions mit dieser Org als Gastgeber (seit Migration 0051). */
  sessions_count: number;
  /** Eigene Bühne (seit Migration 0051). */
  has_stage: boolean;
};

/**
 * Ticket-Kontingent. `status` seit Migration 0051: solange vivenu den Coupon
 * nicht angelegt hat, steht `pending_vivenu` und es gibt weder Code noch Link.
 * `disabled`-Zeilen liefert die RPC nicht mehr.
 */
export type TicketAllocation = {
  id: string;
  pass_type: string;
  quantity: number;
  coupon_code: string | null;
  undershop_url: string | null;
  used_count: number;
  status: "pending_vivenu" | "active" | "error";
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
  /** Seit 0053: Feldliste für `form`. `null` = kein Schema, dann Freitext. */
  answers_schema: AnswerField[] | null;
  /** Seit 0054: Diese Pflicht erledigt eine bestätigte Shop-Bestellung. */
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

/** Zeile aus `my_partner_assets()` — alle Fassungen, neueste zuerst. */
export type PartnerAsset = {
  id: string;
  deliverable_id: string | null;
  deliverable_key: string | null;
  label_de: string | null;
  label_en: string | null;
  kind: string;
  storage_path: string;
  filename: string | null;
  mime: string | null;
  size_bytes: number | null;
  version: number;
  is_current: boolean;
  status: string;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

/** Zeile aus `my_ticket_allocations()`. */
export type TicketAllocationRow = {
  id: string;
  pass_type: string;
  quantity: number;
  used_count: number;
  /** Nur bei `status = active` gefüllt — die RPC hält sie sonst zurück. */
  coupon_code: string | null;
  undershop_url: string | null;
  status: "pending_vivenu" | "active" | "error";
  codes_due_at: string | null;
};

/** Zeile aus `partner_sessions()`. */
export type PartnerSession = {
  id: string;
  event_id: string;
  event_slug: string | null;
  title_de: string | null;
  title_en: string | null;
  format: string | null;
  access_mode: string | null;
  publish_status: string | null;
  capacity: number | null;
  application_deadline: string | null;
  start_at: string | null;
  end_at: string | null;
  stage_name: string | null;
  /** Erst nach der Freigabe verschickt ChefTreff die Entscheidungen. */
  released: boolean;
  counts: {
    total: number;
    applied: number;
    shortlisted: number;
    accepted: number;
    waitlisted: number;
    confirmed: number;
    declined: number;
  };
};

/**
 * Zeile aus `partner_applications()`. Ohne `consent_share` liefert die RPC
 * Name, Antworten und Profil als `null` — angezeigt wird die Zeile trotzdem,
 * nur eben ohne die Daten.
 */
export type PartnerApplication = {
  id: string;
  person_id: string | null;
  display_name: string | null;
  status: string;
  rank: number | null;
  answers: Record<string, unknown> | null;
  consent_share: boolean;
  confirm_by: string | null;
  confirmed_at: string | null;
  decided_at: string | null;
  created_at: string;
  profile: {
    occupation_status?: string | null;
    career_level?: string | null;
    employer_name?: string | null;
    university?: string | null;
    study_field?: string | null;
    city?: string | null;
    linkedin_url?: string | null;
  } | null;
};

/** Entscheidungen, die ein Partner treffen darf (Kontrakt B6). */
export const APPLICATION_DECISIONS = [
  "shortlisted",
  "accepted",
  "waitlisted",
  "declined",
] as const;

/** Pass-Typen, die ein Partner nachfragen kann (Kontrakt B5). */
export const REQUEST_PASS_TYPES = ["partner", "talent", "startup", "investor"] as const;
