/** Was `partner_overview` für eine Organisation zurückgibt (Ausschnitt für B9). */
export type OverviewPayload = {
  org: {
    id: string;
    legal_name: string | null;
    communication_name: string | null;
    type: string | null;
    website: string | null;
    partner_category: string | null;
  };
  team: boolean;
  edition: {
    id: string;
    edition_id: string;
    onboarding_status: string;
    invited_at: string | null;
    onboarding_filled_at: string | null;
    invoice_email: string | null;
    invoice_name: string | null;
    vat_id: string | null;
    po_number: string | null;
    pass_type_choice: string | null;
    sponsoring_level: string | null;
  } | null;
  products: {
    sku: string;
    name_de: string | null;
    name_en: string | null;
    qty: number;
    status: string | null;
  }[];
  ticket_allocations: {
    id: string;
    pass_type: string;
    quantity: number;
    status: string;
    used_count: number;
  }[];
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
  } | null;
  sessions_count: number;
  has_stage: boolean;
};

export type AdminContact = {
  person_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  contact_position: string | null;
  roles: string[] | null;
  has_login: boolean;
  invited_at: string | null;
};

export type AdminDeal = {
  hubspot_deal_id: string;
  deal_name: string | null;
  ingested_at: string | null;
  org_edition_id: string | null;
  edition_id: string | null;
  line_items: { sku?: string; name?: string; qty?: number }[] | null;
};

export type AdminDeliverable = {
  id: string;
  key: string;
  type: string;
  label_de: string | null;
  label_en: string | null;
  status: string;
  due_at: string | null;
  submitted_at: string | null;
  review_note: string | null;
  required: boolean;
  sort: number;
  fulfilled_by_sku: string | null;
};

/** Eine Rollenzuweisung aus `roles_of_person` — für den Bühnen-Editor. */
export type RoleAssignment = {
  id: string;
  role: string;
  scope_type: string;
  scope_id: string | null;
  edition_id: string | null;
  active: boolean;
};
