/** Kontaktrollen laut Entscheidung 1 (Welle 3). `accounting` ist kein Login, sondern nur die Rechnungs-E-Mail. */
export type ContactRole = "primary_ops" | "additional" | "signing" | "event_app_member" | "accounting";

/** Was `ingest_partner_deal(p jsonb)` erwartet — von der Route aus HubSpot-Objekten normalisiert. */
export type IngestPayload = {
  deal: {
    id: string;
    name: string | null;
    pipeline: string | null;
    stage: string | null;
    url: string | null;
    owner_email: string | null;
    owner_name: string | null;
  };
  company: {
    id: string | null;
    legal_name: string | null;
    communication_name: string | null;
    street: string | null;
    zip: string | null;
    city: string | null;
    country: string | null;
    website: string | null;
    description: string | null;
    type: string | null;
    partner_category: string | null;
    invoice_email: string | null;
    invoice_name: string | null;
    vat_id: string | null;
    po_number: string | null;
    sponsoring_level: string | null;
  };
  contacts: {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    position: string | null;
    roles: ContactRole[];
  }[];
  line_items: {
    id: string;
    sku: string | null;
    name: string | null;
    qty: number;
    unit_price_cents: number | null;
  }[];
  job_id?: number | null;
};

export type IngestResult =
  | {
      ok: true;
      already: boolean;
      org_id: string;
      org_edition_id: string;
      new_org?: boolean;
      contacts?: number;
      products?: number;
      allocations?: number;
      roles?: number;
      deliverables?: number;
    }
  | { ok: false; errors: string[]; sync_error_id: number; notified: number; owner_found: boolean };

/** Ein Eintrag aus dem HubSpot-Webhook-Array (Subscription `deal.propertyChange`). */
export type HubspotWebhookEvent = {
  eventId?: number | string;
  subscriptionId?: number | string;
  portalId?: number | string;
  appId?: number | string;
  occurredAt?: number;
  subscriptionType?: string;
  attemptNumber?: number;
  objectId?: number | string;
  propertyName?: string;
  propertyValue?: string;
  changeSource?: string;
};
