import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { assignPrimaryIfSingle, buildIngestPayload, emailOrNull, levelFromBoothType, orgTypeFromHubspot, partnerCategoryFromHubspot, roleFromLabel, rolesForContact, toCents, toQty } from "@/lib/hubspot/mapping";

describe("Kontaktrollen aus HubSpot-Labels", () => {
  it("erkennt die vier Rollen und Buchhaltung in DE und EN", () => {
    assert.equal(roleFromLabel("Hauptkontakt"), "primary_ops");
    assert.equal(roleFromLabel("Primary contact"), "primary_ops");
    assert.equal(roleFromLabel("Unterschrift"), "signing");
    assert.equal(roleFromLabel("Buchhaltung"), "accounting");
    assert.equal(roleFromLabel("Invoice recipient"), "accounting");
    assert.equal(roleFromLabel("Event-App"), "event_app_member");
    assert.equal(roleFromLabel("Weiterer Kontakt"), "additional");
    assert.equal(roleFromLabel(null), null);
  });

  it("ohne Label wird jemand zusätzlicher Kontakt", () => {
    assert.deepEqual(rolesForContact([]), ["additional"]);
    assert.deepEqual(rolesForContact(["Hauptkontakt", "Event-App"]), ["primary_ops", "event_app_member"]);
  });

  it("ein einzelner Login-Kontakt ohne Label ist der Hauptkontakt, zwei bleiben ohne", () => {
    const one = assignPrimaryIfSingle([
      { id: "1", email: "a@x.de", first_name: "A", last_name: "B", position: null, roles: ["additional"] },
      { id: "2", email: "b@x.de", first_name: "C", last_name: "D", position: null, roles: ["accounting"] },
    ]);
    assert.deepEqual(one[0].roles, ["primary_ops"]);
    const two = assignPrimaryIfSingle([
      { id: "1", email: "a@x.de", first_name: "A", last_name: "B", position: null, roles: ["additional"] },
      { id: "2", email: "b@x.de", first_name: "C", last_name: "D", position: null, roles: ["additional"] },
    ]);
    assert.equal(two.some((c) => c.roles.includes("primary_ops")), false);
  });
});

describe("Payload für ingest_partner_deal", () => {
  it("rechnet Preise in Cent, Mengen als Zahl, normalisiert E-Mails", () => {
    assert.equal(toCents("11900.00"), 1190000);
    assert.equal(toCents("35,5"), 3550);
    assert.equal(toCents(null), null);
    assert.equal(toQty("4"), 4);
    assert.equal(toQty("0"), 1);
    assert.equal(toQty(undefined), 1);
  });

  it("baut den Payload aus Deal, Firma, Kontakten und Positionen", () => {
    const p = buildIngestPayload({
      deal: { id: "42", properties: { dealname: "FLS27 Test", pipeline: "p1", dealstage: "s9", hubspot_owner_id: "7" } },
      company: { id: "9", properties: { name: "Test GmbH", communication_name: "Test", address: "Weg 1", zip: "20095", city: "Hamburg", domain: "test.example", invoice_email: "Rechnung@Test.Example " } },
      contacts: [
        { id: "c1", properties: { email: "Anna@Test.Example", firstname: "Anna", lastname: "Muster", jobtitle: "Head" }, labels: ["Hauptkontakt"] },
        { id: "c2", properties: { email: "buch@test.example", firstname: "B", lastname: "H" }, labels: ["Buchhaltung"] },
      ],
      lineItems: [{ id: "li1", properties: { hs_sku: "I-50131", name: "General", quantity: "1", price: "11900" } }],
      owner: { email: "Sales@chef-treff.de", firstName: "Sam", lastName: "Sales" },
      portalId: 123,
    });
    assert.equal(p.deal.url, "https://app.hubspot.com/contacts/123/record/0-3/42");
    assert.equal(p.deal.owner_email, "sales@chef-treff.de");
    assert.equal(p.company.legal_name, "Test GmbH");
    assert.equal(p.company.communication_name, "Test");
    assert.equal(p.company.website, "https://test.example");
    assert.equal(p.company.invoice_email, "rechnung@test.example");
    assert.deepEqual(p.contacts.map((c) => [c.email, c.roles]), [["anna@test.example", ["primary_ops"]], ["buch@test.example", ["accounting"]]]);
    assert.deepEqual(p.line_items, [{ id: "li1", sku: "I-50131", name: "General", qty: 1, unit_price_cents: 1190000 }]);
  });
});

describe("Zuordnung der ChefTreff-Eigenschaften (Bestandsaufnahme 11.09.)", () => {
  it("Standtyp wird zum Level, Partnertyp zur Kategorie, Firmentyp zum Vokabular", () => {
    assert.equal(levelFromBoothType("18qm Premium"), "Premium");
    assert.equal(levelFromBoothType("25qm+ Signature"), "Signature");
    assert.equal(levelFromBoothType("1,5qm Start Up"), "Start Up");
    assert.equal(levelFromBoothType("Main Stage Loge"), "Main Stage Loge");
    assert.equal(levelFromBoothType(null), null);
    assert.equal(partnerCategoryFromHubspot("HR Partner"), "talent");
    assert.equal(partnerCategoryFromHubspot("Startup Partner"), "startup");
    assert.equal(partnerCategoryFromHubspot("Marketing Partner"), null);
    assert.equal(orgTypeFromHubspot("Corporate"), "corporate");
    assert.equal(orgTypeFromHubspot("Universität"), "university");
    assert.equal(orgTypeFromHubspot("VC"), null);
    assert.equal(emailOrNull("Rechnung@Test.Example"), "rechnung@test.example");
    assert.equal(emailOrNull("Frau Muster"), null);
  });

  it("greift im Payload nur, wenn die Portal-Eigenschaft fehlt", () => {
    const p = buildIngestPayload({
      deal: { id: "1", properties: { dealname: "D", pipeline: "p", dealstage: "s" } },
      company: { id: "9", properties: { name: "Muster GmbH", fls_booth_type: "9qm General", fls_partner_type: "HR Partner", ct_company_type: "Startup", purchase_ordner: "PO-7", invoice_contact: "buch@muster.example" } },
      contacts: [],
      lineItems: [],
      owner: null,
      portalId: null,
    });
    assert.equal(p.company.sponsoring_level, "General");
    assert.equal(p.company.partner_category, "talent");
    assert.equal(p.company.type, "startup");
    assert.equal(p.company.po_number, "PO-7");
    assert.equal(p.company.invoice_email, "buch@muster.example");
    assert.equal(p.company.invoice_name, "Muster GmbH");
    const explicit = buildIngestPayload({
      deal: { id: "1", properties: { dealname: "D", pipeline: "p", dealstage: "s" } },
      company: { id: "9", properties: { name: "X", sponsoring_level: "Premium", fls_booth_type: "9qm General", invoice_contact: "kein-mail" } },
      contacts: [], lineItems: [], owner: null, portalId: null,
    });
    assert.equal(explicit.company.sponsoring_level, "Premium");
    assert.equal(explicit.company.invoice_email, null);
  });
});
