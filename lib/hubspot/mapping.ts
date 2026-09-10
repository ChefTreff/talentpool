import type { ContactRole, IngestPayload } from "./types";

/**
 * Welche HubSpot-Eigenschaften der Ingest liest. Interne Namen der Custom Properties
 * stehen hier an einer Stelle; fehlt eine im Portal, kommt einfach `null` und das Gate
 * meldet das Pflichtfeld. Anpassung: docs/runbooks/hubspot-ingest.md.
 */
export const DEAL_PROPERTIES = ["dealname", "pipeline", "dealstage", "hubspot_owner_id", "amount", "closedate"] as const;
export const COMPANY_PROPERTIES = [
  "name", "legal_name", "communication_name", "address", "zip", "city", "country", "website", "domain",
  "description", "organization_type", "partner_category", "invoice_email", "invoice_name", "vat_id",
  "po_number", "sponsoring_level",
] as const;
export const CONTACT_PROPERTIES = ["email", "firstname", "lastname", "jobtitle"] as const;
export const LINE_ITEM_PROPERTIES = ["name", "hs_sku", "quantity", "price"] as const;

export type Props = Record<string, string | null | undefined>;

export function clean(value: string | null | undefined): string | null {
  const s = (value ?? "").toString().trim();
  return s === "" ? null : s;
}

/**
 * Kontaktrolle aus dem Label der Deal↔Kontakt-Zuordnung in HubSpot. Die Labels vergibt das
 * Sales-Team; gematcht wird auf Wortstämme in DE und EN. Ohne passendes Label: `additional`.
 */
export function roleFromLabel(label: string | null | undefined): ContactRole | null {
  const l = (label ?? "").toLowerCase();
  if (!l) return null;
  if (/(haupt|primary|main|operativ|ops)/.test(l)) return "primary_ops";
  if (/(unterschrift|signing|vertrag|contract|zeichn)/.test(l)) return "signing";
  if (/(buchhaltung|accounting|rechnung|invoice|billing|finanz)/.test(l)) return "accounting";
  if (/(event.?app|swapcard|app)/.test(l)) return "event_app_member";
  if (/(weiter|additional|cc|team|zusatz)/.test(l)) return "additional";
  return null;
}

export function rolesForContact(labels: (string | null | undefined)[]): ContactRole[] {
  const roles = new Set<ContactRole>();
  for (const label of labels) {
    const role = roleFromLabel(label);
    if (role) roles.add(role);
  }
  if (roles.size === 0) roles.add("additional");
  return [...roles];
}

/** Genau ein Login-Kontakt ohne Rollen-Label ⇒ er ist der Hauptkontakt. Bei mehreren entscheidet das Gate (primary_contact_missing). */
export function assignPrimaryIfSingle(contacts: IngestPayload["contacts"]): IngestPayload["contacts"] {
  if (contacts.some((c) => c.roles.includes("primary_ops"))) return contacts;
  const logins = contacts.filter((c) => c.roles.some((r) => r !== "accounting"));
  if (logins.length !== 1) return contacts;
  const single = logins[0];
  return contacts.map((c) =>
    c === single
      ? { ...c, roles: [...new Set<ContactRole>(["primary_ops", ...c.roles.filter((r) => r !== "additional")])] }
      : c,
  );
}

/** HubSpot liefert Preise als Dezimalstring in der Deal-Währung. */
export function toCents(price: string | null | undefined): number | null {
  const n = Number.parseFloat((price ?? "").toString().replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function toQty(quantity: string | null | undefined): number {
  const n = Number.parseFloat((quantity ?? "").toString().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function dealUrl(portalId: string | number | null | undefined, dealId: string): string | null {
  return portalId ? `https://app.hubspot.com/contacts/${portalId}/record/0-3/${dealId}` : null;
}

export type HubspotRecords = {
  deal: { id: string; properties: Props };
  company: { id: string; properties: Props } | null;
  contacts: { id: string; properties: Props; labels: string[] }[];
  lineItems: { id: string; properties: Props }[];
  owner: { email?: string | null; firstName?: string | null; lastName?: string | null } | null;
  portalId: string | number | null;
};

/** Aus den HubSpot-Objekten den Payload für `ingest_partner_deal` bauen — rein, ohne Netz. */
export function buildIngestPayload(r: HubspotRecords): IngestPayload {
  const d = r.deal.properties;
  const c = r.company?.properties ?? {};
  const ownerName = [clean(r.owner?.firstName), clean(r.owner?.lastName)].filter(Boolean).join(" ") || null;
  const contacts = assignPrimaryIfSingle(
    r.contacts.map((ct) => ({
      id: ct.id,
      email: clean(ct.properties.email)?.toLowerCase() ?? null,
      first_name: clean(ct.properties.firstname),
      last_name: clean(ct.properties.lastname),
      position: clean(ct.properties.jobtitle),
      roles: rolesForContact(ct.labels),
    })),
  );
  return {
    deal: {
      id: r.deal.id,
      name: clean(d.dealname),
      pipeline: clean(d.pipeline),
      stage: clean(d.dealstage),
      url: dealUrl(r.portalId, r.deal.id),
      owner_email: clean(r.owner?.email)?.toLowerCase() ?? null,
      owner_name: ownerName,
    },
    company: {
      id: r.company?.id ?? null,
      legal_name: clean(c.legal_name) ?? clean(c.name),
      communication_name: clean(c.communication_name) ?? clean(c.name),
      street: clean(c.address),
      zip: clean(c.zip),
      city: clean(c.city),
      country: clean(c.country),
      website: clean(c.website) ?? (clean(c.domain) ? `https://${clean(c.domain)}` : null),
      description: clean(c.description),
      type: clean(c.organization_type),
      partner_category: clean(c.partner_category),
      invoice_email: clean(c.invoice_email)?.toLowerCase() ?? null,
      invoice_name: clean(c.invoice_name),
      vat_id: clean(c.vat_id),
      po_number: clean(c.po_number),
      sponsoring_level: clean(c.sponsoring_level),
    },
    contacts,
    line_items: r.lineItems.map((li) => ({
      id: li.id,
      sku: clean(li.properties.hs_sku),
      name: clean(li.properties.name),
      qty: toQty(li.properties.quantity),
      unit_price_cents: toCents(li.properties.price),
    })),
  };
}
