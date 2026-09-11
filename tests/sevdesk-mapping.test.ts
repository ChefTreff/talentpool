import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildInvoicePayload, euro, invoiceAddress, type InvoiceCandidate } from "@/lib/sevdesk/mapping";

const candidate: InvoiceCandidate = {
  org_id: "org-1", legal_name: "Rechnung A GmbH", communication_name: "RechA", address_street: "Weg 1", address_zip: "20095", address_city: "Hamburg", address_country: "DE",
  invoice_email: "buchhaltung@recha.example", invoice_name: "Abteilung Events", vat_id: "DE123", po_number: "PO-77", sevdesk_contact_id: null,
  order_ids: ["o1", "o2"], order_nos: ["MS-2026-0001", "MS-2026-0002"],
  positions: [
    { sku: "I-11329", name: "Gitterbox", unit: "piece", qty: "3", price_net_cents: 31500, vat_rate: "7", net_cents: 94500 },
    { sku: "I-79520", name: "Lunchpaket", unit: "piece", qty: 3, price_net_cents: 3500, vat_rate: 7, net_cents: 10500 },
  ],
  net_cents: 105000, vat_cents: 7350, gross_cents: 112350,
};

describe("SevDesk-Entwurf aus Shop-Bestellungen", () => {
  it("rechnet Cent in Euro und baut den Adressblock", () => {
    assert.equal(euro(31500), 315);
    assert.equal(euro(3549), 35.49);
    assert.equal(invoiceAddress(candidate), "Abteilung Events\nRechnung A GmbH\nWeg 1\n20095 Hamburg\nDE");
  });

  it("baut einen Entwurf (Status 100) mit allen Positionen, Steuersatz und Bestellnummern", () => {
    const p = buildInvoicePayload(candidate, { contactId: "c1", contactPersonId: "u1", countryId: 1, invoiceDate: "2027-04-20", deliveryDate: "2027-04-17", editionLabel: "FLS27", costCentreId: "cc9" });
    assert.equal(p.invoice.status, 100);
    assert.equal(p.invoice.contact.id, "c1");
    assert.equal(p.invoice.contactPerson.id, "u1");
    assert.equal(p.invoice.header, "Messeshop FLS27 – RechA");
    assert.match(p.invoice.headText, /PO-77/);
    assert.match(p.invoice.headText, /MS-2026-0001, MS-2026-0002/);
    assert.equal(p.invoicePosSave.length, 2);
    assert.deepEqual(p.invoicePosSave.map((x) => [x.quantity, x.price, x.taxRate]), [[3, 315, 7], [3, 35, 7]]);
    assert.equal(p.invoice.costCentre?.id, "cc9");
    const sum = p.invoicePosSave.reduce((acc, x) => acc + x.quantity * x.price, 0);
    assert.equal(Math.round(sum * 100), candidate.net_cents);
  });

  it("lässt die Kostenstelle weg, wenn keine gesetzt ist", () => {
    const p = buildInvoicePayload(candidate, { contactId: "c1", contactPersonId: "u1", countryId: 1, invoiceDate: "2027-04-20", deliveryDate: "2027-04-17", editionLabel: "FLS27" });
    assert.equal("costCentre" in p.invoice, false);
  });
});
