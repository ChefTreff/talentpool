/**
 * Reine Zuordnung Shop-Kandidat → SevDesk-Rechnungsentwurf (ohne Netz, im Node-Test prüfbar).
 *
 * IDs aus dem SevDesk-Standard (Stand API v1): Contact-Kategorie 3 = Kunde, ContactAddress-Kategorie 47 = Rechnungsadresse,
 * CommunicationWayKey 8 = Rechnungsadresse (E-Mail), StaticCountry 1 = Deutschland, Unity 1 = Stück, TaxRule 1 = umsatzsteuerpflichtige Umsätze.
 * Beim ersten echten Lauf gegen das Konto gegenlesen (docs/runbooks/sevdesk-shop-rechnungen.md).
 */
export const SEVDESK_IDS = {
  contactCategoryCustomer: 3,
  addressCategoryInvoice: 47,
  communicationKeyInvoice: 8,
  countryGermany: 1,
  unityPiece: 1,
  taxRuleStandard: 1,
} as const;

/** Zeile aus `shop_invoice_candidates()`. */
export type InvoiceCandidate = {
  org_id: string;
  legal_name: string | null;
  communication_name: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  address_country: string | null;
  invoice_email: string | null;
  invoice_name: string | null;
  vat_id: string | null;
  po_number: string | null;
  sevdesk_contact_id: string | null;
  order_ids: string[];
  order_nos: string[];
  positions: { sku: string; name: string | null; unit: string | null; qty: number | string; price_net_cents: number; vat_rate: number | string; net_cents: number }[];
  net_cents: number;
  vat_cents: number;
  gross_cents: number;
};

export function euro(cents: number): number {
  return Math.round(cents) / 100;
}

/** Adressblock wie er auf der Rechnung steht; Rechnungsname (z. B. Abteilung) vor dem Firmennamen. */
export function invoiceAddress(c: InvoiceCandidate): string {
  return [c.invoice_name, c.legal_name ?? c.communication_name, c.address_street, [c.address_zip, c.address_city].filter(Boolean).join(" "), c.address_country]
    .map((v) => (v ?? "").toString().trim())
    .filter((v) => v !== "")
    .join("\n");
}

export type InvoiceContext = {
  contactId: string;
  contactPersonId: string;
  countryId: number;
  /** ISO-Datum JJJJ-MM-TT */
  invoiceDate: string;
  deliveryDate: string;
  editionLabel: string;
  costCentreId?: string | null;
};

export function buildInvoicePayload(c: InvoiceCandidate, ctx: InvoiceContext) {
  const name = c.communication_name ?? c.legal_name ?? "Partner";
  const positions = c.positions.map((p, i) => ({
    objectName: "InvoicePos",
    mapAll: true,
    positionNumber: i,
    quantity: Number(p.qty),
    price: euro(p.price_net_cents),
    name: `${p.name ?? p.sku}`,
    text: `SKU ${p.sku}${p.unit && p.unit !== "piece" ? ` · Einheit ${p.unit}` : ""}`,
    unity: { id: SEVDESK_IDS.unityPiece, objectName: "Unity" },
    taxRate: Number(p.vat_rate),
  }));
  const orders = c.order_nos.join(", ");
  return {
    invoice: {
      objectName: "Invoice",
      mapAll: true,
      invoiceType: "RE",
      status: 100,
      currency: "EUR",
      showNet: true,
      smallSettlement: false,
      contact: { id: ctx.contactId, objectName: "Contact" },
      contactPerson: { id: ctx.contactPersonId, objectName: "SevUser" },
      invoiceDate: ctx.invoiceDate,
      deliveryDate: ctx.deliveryDate,
      header: `Messeshop ${ctx.editionLabel} – ${name}`,
      headText: [c.po_number ? `Ihre Bestellnummer: ${c.po_number}` : null, `Bestellungen im Messeshop: ${orders}`].filter(Boolean).join("\n"),
      footText: "Rechnung nach dem Summit über den ChefTreff Messeshop. Alle Preise netto zzgl. gesetzlicher USt.",
      address: invoiceAddress(c),
      addressCountry: { id: ctx.countryId, objectName: "StaticCountry" },
      taxRule: { id: SEVDESK_IDS.taxRuleStandard, objectName: "TaxRule" },
      taxType: "default",
      taxText: "Umsatzsteuer",
      taxRate: positions.length ? positions[0].taxRate : 7,
      customerInternalNote: `Portal: ${c.org_id} · ${orders}`,
      ...(ctx.costCentreId ? { costCentre: { id: ctx.costCentreId, objectName: "CostCentre" } } : {}),
    },
    invoicePosSave: positions,
    invoicePosDelete: null,
    discountSave: null,
    discountDelete: null,
    takeDefaultAddress: false,
  };
}
