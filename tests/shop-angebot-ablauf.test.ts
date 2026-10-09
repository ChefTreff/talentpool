import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  angebotModus,
  angebotsAdresse,
  angebotVerfuegbar,
  buildQuotePayload,
  erstelleAngebot,
  fusstext,
  gueltigBis,
  istDeutschland,
  istProbeKunde,
  statusZuSchluessel,
  wegWaehlen,
  type AngebotAbhaengigkeiten,
  type AngebotGrundlage,
  type AngebotModus,
} from "@/lib/sevdesk/angebot";

/**
 * PART-116 (K-81), Teil 2 — die Zuordnung Warenkorb → SevDesk-Angebot und der Ablauf der Route (`erstelleAngebot`) mit Abhängigkeiten aus dem Test: kein Netz, keine
 * Datenbank. Die Datenbank-Seite belegt `supabase/tests/v6_shop_angebot.sql`; gegen SevDesk selbst wurde nichts probiert (der Schalter steht auf „aus“, bis Konrad
 * zustimmt). Geprüft wird hier vor allem die **Reihenfolge** — sperren, dann SevDesk, dann eintragen — und was bei jedem Fehler zurückbleibt.
 */
const GRUNDLAGE: AngebotGrundlage = {
  order_id: "11111111-1111-4111-8111-111111111111",
  order_no: "MS-2026-0007",
  phase: 1,
  po_number: null,
  org: {
    id: "22222222-2222-4222-8222-222222222222",
    legal_name: "Beispiel GmbH",
    communication_name: "Beispiel",
    customer_number: "C-1001",
    sevdesk_contact_id: null,
    address_street: "Hafenstraße 1",
    address_zip: "20095",
    address_city: "Hamburg",
    address_country: "Deutschland",
    address_extra: "3. OG",
    vat_id: "DE123456789",
    invoice_email: "buchhaltung@example.com",
    invoice_name: null,
  },
  lines: [
    { sku: "I-11329", name_de: "Gitterbox", name_en: "Wire cage", unit: "piece", vat_rate: 7, price_net_cents: 31500, qty: 2, line_net_cents: 63000 },
    { sku: "I-12346", name_de: "Theke weiß", name_en: "Counter", unit: "piece", vat_rate: 19, price_net_cents: 29880, qty: 1, line_net_cents: 29880 },
  ],
  totals: { net_cents: 92880, vat_cents: 10095, gross_cents: 102975 },
  lines_hash: "abc123",
  quotes_used: 0,
};
const HEUTE = new Date("2026-10-09T08:00:00Z");

function mitOrg(teil: Partial<AngebotGrundlage["org"]>): AngebotGrundlage {
  return { ...GRUNDLAGE, org: { ...GRUNDLAGE.org, ...teil } };
}

type Aufruf = string;

/** Abhängigkeiten, die jeden Aufruf mitschreiben; `ueberschreibe` ersetzt einzelne. */
function abhaengigkeiten(
  modus: AngebotModus,
  g: AngebotGrundlage,
  ueberschreibe: Partial<Omit<AngebotAbhaengigkeiten, "sd">> & { sd?: Partial<AngebotAbhaengigkeiten["sd"]> } = {},
  hatToken = true,
): { dep: AngebotAbhaengigkeiten; log: Aufruf[]; payloads: unknown[]; records: Parameters<AngebotAbhaengigkeiten["record"]>[0][] } {
  const log: Aufruf[] = [];
  const payloads: unknown[] = [];
  const records: Parameters<AngebotAbhaengigkeiten["record"]>[0][] = [];
  const { sd: sdUeber, ...rest } = ueberschreibe;
  const dep: AngebotAbhaengigkeiten = {
    modus,
    hatToken,
    heute: () => HEUTE,
    async begin() {
      log.push("begin");
      return { data: g, error: null };
    },
    async abort(_id, grund) {
      log.push(`abort:${grund}`);
    },
    async record(a) {
      log.push(`record:${a.probe ? "probe" : "live"}`);
      records.push(a);
      return { error: null };
    },
    async gueltigkeit() {
      log.push("gueltigkeit");
      return "2026-11-08T08:00:00Z";
    },
    async protokoll(a) {
      log.push(`protokoll:${a.message.slice(0, 40)}`);
    },
    ...rest,
    sd: {
      async kontakte() {
        log.push("kontakte");
        return [];
      },
      async kontaktAnlegen() {
        log.push("kontakt-anlegen");
        return "C-NEU";
      },
      async ansprechpartner() {
        return "SU-1";
      },
      async land() {
        return 1;
      },
      async artikel(sku) {
        return sku === "I-11329" ? "PART-1" : null;
      },
      async naechsteNummer() {
        return "AN-1232";
      },
      async angebotSpeichern(payload) {
        log.push("speichern");
        payloads.push(payload);
        return { id: "SD-ORDER-1", orderNumber: "AN-1232" };
      },
      async angebotLoeschen(id) {
        log.push(`loeschen:${id}`);
      },
      async festschreiben(id) {
        log.push(`festschreiben:${id}`);
      },
      ...sdUeber,
    },
  };
  return { dep, log, payloads, records };
}

describe("PART-116: Gültigkeit und Texte", () => {
  it("gueltigBis zählt Kalendertage in Berliner Zeit, über Monats- und Jahresgrenzen", () => {
    assert.deepEqual(gueltigBis(new Date("2026-10-09T08:00:00Z")), { iso: "2026-11-08", de: "08.11.2026" });
    assert.deepEqual(gueltigBis(new Date("2026-12-15T10:00:00Z")), { iso: "2027-01-14", de: "14.01.2027" });
    // 22:30 UTC ist in Berlin schon der nächste Tag
    assert.deepEqual(gueltigBis(new Date("2026-10-09T22:30:00Z")), { iso: "2026-11-09", de: "09.11.2026" });
  });

  it("der Fußtext nennt Frist, PO-Weg und Netto-Hinweis und lässt die Ansprechperson von SevDesk einsetzen", () => {
    const t = fusstext("08.11.2026");
    assert.match(t, /30 Tage gültig \(bis 08\.11\.2026\)/);
    assert.match(t, /Partner-Portal unter Messeshop/);
    assert.match(t, /Bestellnummer \(PO\)/);
    assert.match(t, /netto zuzüglich gesetzlicher Umsatzsteuer/);
    assert.match(t, /\[%KONTAKTPERSON%\]$/);
  });
});

describe("PART-116: Schalter und Weg", () => {
  it("angebotModus: nur probe und live schalten etwas ein, alles andere heißt aus", () => {
    assert.equal(angebotModus(undefined), "aus");
    assert.equal(angebotModus(""), "aus");
    assert.equal(angebotModus("ja"), "aus");
    assert.equal(angebotModus("true"), "aus");
    assert.equal(angebotModus("probe"), "probe");
    assert.equal(angebotModus(" LIVE "), "live");
    assert.equal(angebotModus("Probe"), "probe");
  });

  it("Kundennummern mit ZZTEST gehören Testorganisationen", () => {
    for (const ok of ["ZZTEST-NR-1", "zztest", " ZZTEST-7"]) assert.equal(istProbeKunde(ok), true, ok);
    for (const nein of ["C-1001", "TEST-1", "", null, undefined, "AZZTEST"]) assert.equal(istProbeKunde(nein as string | null | undefined), false, String(nein));
  });

  it("wegWaehlen: SevDesk nur nach Freigabe, eine Testorganisation nie live", () => {
    const f = (modus: AngebotModus, nr: string | null, token: boolean) => wegWaehlen(modus, nr, token);
    assert.equal(f("aus", "ZZTEST-1", true), "simuliert");
    assert.equal(f("probe", "ZZTEST-1", true), "sevdesk-probe");
    assert.equal(f("probe", "ZZTEST-1", false), "simuliert");
    assert.equal(f("live", "ZZTEST-1", true), "sevdesk-probe");
    assert.equal(f("live", "C-1001", true), "sevdesk-live");
    assert.equal(f("live", "C-1001", false), "nicht-verfuegbar");
    assert.equal(f("probe", "C-1001", true), "nicht-verfuegbar");
    assert.equal(f("aus", "C-1001", true), "nicht-verfuegbar");
    assert.equal(f("aus", null, true), "nicht-verfuegbar");
  });

  it("angebotVerfuegbar nennt den ersten Grund — dieselbe Reihenfolge wie shop_quote_begin", () => {
    const voll = { modus: "live" as const, hatToken: true, kundennummer: "C-1", land: "Deutschland", strasse: "a", plz: "1", ort: "b" };
    assert.deepEqual(angebotVerfuegbar(voll), { ok: true, weg: "sevdesk-live" });
    assert.deepEqual(angebotVerfuegbar({ ...voll, kundennummer: " " }), { ok: false, grund: "kundennummer" });
    assert.deepEqual(angebotVerfuegbar({ ...voll, land: "Spanien" }), { ok: false, grund: "land" });
    assert.deepEqual(angebotVerfuegbar({ ...voll, land: null }), { ok: true, weg: "sevdesk-live" });
    assert.deepEqual(angebotVerfuegbar({ ...voll, plz: "" }), { ok: false, grund: "adresse" });
    assert.deepEqual(angebotVerfuegbar({ ...voll, modus: "aus" }), { ok: false, grund: "abgeschaltet" });
    // Kundennummer vor Land vor Adresse vor Schalter
    assert.deepEqual(angebotVerfuegbar({ ...voll, kundennummer: null, land: "Spanien", plz: "", modus: "aus" }), { ok: false, grund: "kundennummer" });
    assert.deepEqual(angebotVerfuegbar({ ...voll, land: "Spanien", plz: "", modus: "aus" }), { ok: false, grund: "land" });
    assert.deepEqual(angebotVerfuegbar({ ...voll, plz: "", modus: "aus" }), { ok: false, grund: "adresse" });
    assert.deepEqual(angebotVerfuegbar({ ...voll, kundennummer: "ZZTEST-1", modus: "aus" }), { ok: true, weg: "simuliert" });
  });

  it("angebotVerfuegbar: Straße, PLZ und Ort müssen alle drei da sein — leer, nur Leerzeichen, null und fehlend zählen als fehlend", () => {
    const voll = { modus: "live" as const, hatToken: true, kundennummer: "C-1", land: "Deutschland", strasse: "a", plz: "1", ort: "b" };
    for (const teil of [{ strasse: "" }, { strasse: null }, { plz: " " }, { ort: undefined }, { ort: "\n" }]) {
      assert.deepEqual(angebotVerfuegbar({ ...voll, ...teil }), { ok: false, grund: "adresse" }, JSON.stringify(teil));
    }
  });

  it("istDeutschland: Deutschland in allen Schreibweisen, leer zählt dazu", () => {
    for (const ja of ["DE", "de", " Deutschland ", "GERMANY", "", null, undefined]) assert.equal(istDeutschland(ja), true, String(ja));
    for (const nein of ["Spanien", "AT", "Österreich"]) assert.equal(istDeutschland(nein), false, nein);
  });
});

describe("PART-116: Auftrag an SevDesk", () => {
  const kontext = {
    contactId: "C-9", contactPersonId: "SU-1", countryId: 1, orderNumber: "AN-1232", orderDate: "2026-10-09",
    gueltig: { iso: "2026-11-08", de: "08.11.2026" }, partIds: { "I-11329": "PART-1", "I-12346": null },
  };

  it("ein Angebot (AN), Entwurf, netto, Steuerregel 1 — mit Nummer, Titel, Texten und Gültigkeit", () => {
    const p = buildQuotePayload(GRUNDLAGE, kontext);
    assert.equal(p.order.orderType, "AN");
    assert.equal(p.order.status, 100);
    assert.equal(p.order.orderNumber, "AN-1232");
    assert.equal(p.order.header, "Angebot AN-1232");
    assert.equal(p.order.currency, "EUR");
    assert.equal(p.order.showNet, true);
    assert.equal(p.order.taxRule.id, 1);
    assert.equal(p.order.contact.id, "C-9");
    assert.equal(p.order.contactPerson.id, "SU-1");
    assert.equal(p.order.addressCountry.id, 1);
    assert.equal(p.order.orderDate, "2026-10-09");
    assert.match(p.order.footText, /bis 08\.11\.2026/);
    assert.match(p.order.headText, /Moin Moin!/);
    assert.match(p.order.customerInternalNote, /MS-2026-0007/);
    assert.equal(p.orderPosDelete, null);
  });

  it("jede Zeile mit Menge, Nettopreis in Euro, Name, Steuersatz; der Artikel nur, wo es einen gibt", () => {
    const p = buildQuotePayload(GRUNDLAGE, kontext);
    assert.equal(p.orderPosSave.length, 2);
    const [a, b] = p.orderPosSave;
    assert.equal(a.quantity, 2);
    assert.equal(a.price, 315);
    assert.equal(a.name, "Gitterbox");
    assert.equal(a.taxRate, 7);
    assert.deepEqual(a.part, { id: "PART-1", objectName: "Part" });
    assert.equal(a.positionNumber, 0);
    assert.equal(b.price, 298.8);
    assert.equal(b.taxRate, 19);
    assert.equal("part" in b, false);
    assert.equal(b.positionNumber, 1);
  });

  it("Menge und Steuersatz kommen als Zahl oder als Text aus der Datenbank und gehen als Zahl hinaus; fehlt der Satz, gilt 7", () => {
    const g = {
      ...GRUNDLAGE,
      lines: [
        { ...GRUNDLAGE.lines[0], qty: "3", vat_rate: "19" },
        { ...GRUNDLAGE.lines[1], vat_rate: null },
      ],
    };
    const [a, b] = buildQuotePayload(g, kontext).orderPosSave;
    assert.equal(a.quantity, 3);
    assert.equal(a.taxRate, 19);
    assert.equal(b.taxRate, 7);
  });

  it("der Name fällt auf die SKU zurück; die Einheit steht im Text, außer bei Stück und ohne Angabe", () => {
    const g = {
      ...GRUNDLAGE,
      lines: [
        { ...GRUNDLAGE.lines[0] },
        { ...GRUNDLAGE.lines[1], name_de: null, unit: "hour" },
        { ...GRUNDLAGE.lines[1], sku: "I-3", unit: null },
      ],
    };
    const [a, b, c] = buildQuotePayload(g, kontext).orderPosSave;
    assert.equal(a.name, "Gitterbox");
    assert.equal(a.text, "SKU I-11329");
    assert.equal(b.name, "I-12346");
    assert.equal(b.text, "SKU I-12346 · Einheit hour");
    assert.equal(c.text, "SKU I-3");
  });

  it("der Kopf trägt den Steuersatz der ersten Zeile, ohne Zeilen 7", () => {
    assert.equal(buildQuotePayload(GRUNDLAGE, kontext).order.taxRate, 7);
    assert.equal(buildQuotePayload({ ...GRUNDLAGE, lines: [GRUNDLAGE.lines[1], GRUNDLAGE.lines[0]] }, kontext).order.taxRate, 19);
    assert.equal(buildQuotePayload({ ...GRUNDLAGE, lines: [] }, kontext).order.taxRate, 7);
  });

  it("die Adresse trägt die abweichende Firmierung statt des Firmennamens und den Zusatz unter der Straße", () => {
    assert.equal(angebotsAdresse(GRUNDLAGE.org), "Beispiel GmbH\nHafenstraße 1\n3. OG\n20095 Hamburg\nDeutschland");
    assert.equal(angebotsAdresse({ ...GRUNDLAGE.org, invoice_name: "Beispiel Einkauf", address_extra: null }), "Beispiel Einkauf\nHafenstraße 1\n20095 Hamburg\nDeutschland");
  });

  it("die Bestellnummer des Partners (PO) steht in der internen Notiz, wenn sie schon da ist", () => {
    const p = buildQuotePayload({ ...GRUNDLAGE, po_number: "PO-77" }, kontext);
    assert.match(p.order.customerInternalNote, /PO PO-77/);
  });
});

describe("PART-116: HTTP-Status zu den Fehlerschlüsseln", () => {
  it("Recht 403, nicht gefunden 404, Zustand 409, Voraussetzung 422, SevDesk 502, abgeschaltet 503", () => {
    assert.equal(statusZuSchluessel("not_allowed"), 403);
    assert.equal(statusZuSchluessel("not_authenticated"), 401);
    assert.equal(statusZuSchluessel("order_not_found"), 404);
    for (const k of ["order_quoted", "not_editable", "not_quoted", "phase_closed", "quote_limit_reached", "quote_in_progress"]) assert.equal(statusZuSchluessel(k), 409, k);
    for (const k of ["quote_customer_number_required", "quote_country_unsupported", "quote_address_incomplete", "empty_order", "merch_incomplete", "out_of_stock"]) {
      assert.equal(statusZuSchluessel(k), 422, k);
    }
    assert.equal(statusZuSchluessel("quote_failed"), 502);
    assert.equal(statusZuSchluessel("quote_contact_ambiguous"), 502);
    assert.equal(statusZuSchluessel("quote_unavailable"), 503);
    assert.equal(statusZuSchluessel("quote_record_failed"), 500);
    assert.equal(statusZuSchluessel("unknown"), 500);
  });
});

describe("PART-116: erstelleAngebot — Reihenfolge und was bei Fehlern zurückbleibt", () => {
  it("scheitert das Sperren (kein Recht), ist nichts passiert: kein SevDesk, kein Eintrag, kein Abbruch nötig", async () => {
    const { dep, log } = abhaengigkeiten("live", GRUNDLAGE, {
      async begin() {
        log.push("begin");
        return { data: null, error: { message: "not allowed", code: "42501" } };
      },
    });
    const r = await erstelleAngebot(dep, GRUNDLAGE.order_id);
    assert.deepEqual(r, { ok: false, key: "not_allowed", status: 403 });
    assert.deepEqual(log, ["begin"]);
  });

  it("ein Fehlerschlüssel der Datenbank kommt als Schlüssel mit Status zurück (Warenkorb schon gesperrt: 409)", async () => {
    const { dep, log } = abhaengigkeiten("live", GRUNDLAGE, { async begin() { return { data: null, error: { message: "order_quoted", code: "P0001", details: "x" } }; } });
    const r = await erstelleAngebot(dep, GRUNDLAGE.order_id);
    assert.deepEqual(r, { ok: false, key: "order_quoted", status: 409, detail: "x" });
    assert.deepEqual(log, []);
  });

  it("abgeschaltet (Schalter aus, keine Testorganisation): die Bestellung wird sofort wieder frei, SevDesk bleibt unberührt", async () => {
    const { dep, log, records } = abhaengigkeiten("aus", GRUNDLAGE);
    const r = await erstelleAngebot(dep, GRUNDLAGE.order_id);
    assert.deepEqual(r, { ok: false, key: "quote_unavailable", status: 503 });
    assert.deepEqual(log, ["begin", "abort:unavailable"]);
    assert.equal(records.length, 0);
  });

  it("Simulation (Testorganisation, Schalter aus): keine SevDesk-Aufrufe, Beleg als Probe, Nummer AN-PROBE", async () => {
    const g = mitOrg({ customer_number: "ZZTEST-NR-1" });
    const { dep, log, records } = abhaengigkeiten("aus", g);
    const r = await erstelleAngebot(dep, g.order_id);
    assert.deepEqual(r, { ok: true, nummer: "AN-PROBE-0001", gueltigBis: "2026-11-08T08:00:00Z", probe: true, weg: "simuliert" });
    assert.deepEqual(log, ["begin", "record:probe", "gueltigkeit"]);
    assert.equal(records[0].sevdeskOrderId, `SIM-${g.order_id}-1`);
    assert.equal(records[0].contactId, null);
    assert.equal(records[0].netCents, 92880);
    assert.equal(records[0].linesHash, "abc123");
  });

  it("Simulation: die Nummer zählt mit den Angeboten (AN-PROBE-0003 beim dritten)", async () => {
    const g = { ...mitOrg({ customer_number: "ZZTEST-NR-1" }), quotes_used: 2 };
    const { dep } = abhaengigkeiten("aus", g);
    const r = await erstelleAngebot(dep, g.order_id);
    assert.equal(r.ok && r.nummer, "AN-PROBE-0003");
  });

  it("Simulation: scheitert der Eintrag, wird die Bestellung frei und der Schlüssel der Datenbank kommt zurück", async () => {
    const g = mitOrg({ customer_number: "ZZTEST-NR-1" });
    const { dep, log } = abhaengigkeiten("aus", g, { async record() { log.push("record:probe"); return { error: { message: "quote_hash_mismatch", code: "P0001" } }; } });
    const r = await erstelleAngebot(dep, g.order_id);
    assert.deepEqual(r, { ok: false, key: "quote_hash_mismatch", status: 422 });
    assert.deepEqual(log, ["begin", "record:probe", "abort:record_failed"]);
  });

  it("Probebetrieb in SevDesk: Kontakt anlegen, Entwurf speichern, eintragen, **dann** den Entwurf löschen — nie festschreiben", async () => {
    const g = mitOrg({ customer_number: "ZZTEST-NR-1" });
    const { dep, log, payloads, records } = abhaengigkeiten("probe", g);
    const r = await erstelleAngebot(dep, g.order_id);
    assert.deepEqual(r, { ok: true, nummer: "AN-1232", gueltigBis: "2026-11-08T08:00:00Z", probe: true, weg: "sevdesk-probe" });
    assert.deepEqual(log, ["begin", "kontakte", "kontakt-anlegen", "speichern", "record:probe", "loeschen:SD-ORDER-1", "gueltigkeit"]);
    assert.equal(log.some((x) => x.startsWith("festschreiben")), false);
    assert.equal(records[0].sevdeskOrderId, "SD-ORDER-1");
    assert.equal(records[0].contactId, "C-NEU");
    assert.equal((payloads[0] as { order: { status: number } }).order.status, 100);
  });

  it("an SevDesk gehen die Angaben der Bestellung: Kontakt, Auftrag (Nummer, Datum, Frist, Ansprechperson, Land, Artikel) und der Eintrag (Summe, Hash)", async () => {
    const g = mitOrg({ customer_number: "ZZTEST-NR-1", invoice_name: "Beispiel Einkauf" });
    const kontakte: Parameters<AngebotAbhaengigkeiten["sd"]["kontaktAnlegen"]>[0][] = [];
    const { dep, payloads, records } = abhaengigkeiten("probe", g, {
      sd: {
        async kontaktAnlegen(a) {
          kontakte.push(a);
          return "C-NEU";
        },
      },
    });
    const r = await erstelleAngebot(dep, g.order_id);
    assert.equal(r.ok, true);
    assert.deepEqual(kontakte, [
      {
        name: "Beispiel Einkauf",
        vatNumber: "DE123456789",
        customerNumber: "ZZTEST-NR-1",
        street: "Hafenstraße 1",
        zip: "20095",
        city: "Hamburg",
        country: "Deutschland",
        email: "buchhaltung@example.com",
      },
    ]);
    const p = payloads[0] as ReturnType<typeof buildQuotePayload>;
    assert.equal(p.order.orderNumber, "AN-1232");
    assert.equal(p.order.orderDate, "2026-10-09");
    assert.match(p.order.footText, /bis 08\.11\.2026/);
    assert.equal(p.order.contact.id, "C-NEU");
    assert.equal(p.order.contactPerson.id, "SU-1");
    assert.equal(p.order.addressCountry.id, 1);
    assert.deepEqual(p.orderPosSave[0].part, { id: "PART-1", objectName: "Part" });
    assert.equal("part" in p.orderPosSave[1], false);
    assert.equal(records[0].netCents, 92880);
    assert.equal(records[0].linesHash, "abc123");
  });

  it("meldet SevDesk keine Nummer zurück, gilt die Id als Nummer", async () => {
    const { dep, records } = abhaengigkeiten("live", GRUNDLAGE, { sd: { async angebotSpeichern() { return { id: "SD-9", orderNumber: null }; } } });
    const r = await erstelleAngebot(dep, GRUNDLAGE.order_id);
    assert.equal(r.ok && r.nummer, "AN-SD-9");
    assert.equal(records[0].nummer, "AN-SD-9");
  });

  it("das Protokoll fürs Team trägt Status und Pfad der SevDesk-Antwort und die Bestellung; die Meldung ist auf 500 Zeichen gekürzt", async () => {
    const protokolle: { objectId: string; message: string; payload: Record<string, unknown> }[] = [];
    const lang = Object.assign(new Error("x".repeat(2000)), { status: 422, path: "/Order/Factory/saveOrder" });
    const { dep } = abhaengigkeiten("live", GRUNDLAGE, {
      async protokoll(a) { protokolle.push(a); },
      sd: { async angebotSpeichern() { throw lang; } },
    });
    await erstelleAngebot(dep, GRUNDLAGE.order_id);
    assert.equal(protokolle[0].objectId, GRUNDLAGE.order_id);
    assert.equal(protokolle[0].message.length, 500);
    assert.equal(protokolle[0].payload.status, 422);
    assert.equal(protokolle[0].payload.path, "/Order/Factory/saveOrder");
    assert.equal(protokolle[0].payload.order, "MS-2026-0007");
  });

  it("Probebetrieb: lässt sich der Entwurf nach dem Eintrag nicht löschen, bleibt die Antwort ein Erfolg — das Team liest es im Protokoll", async () => {
    const g = mitOrg({ customer_number: "ZZTEST-NR-1" });
    const protokolle: { objectId: string; message: string; payload: Record<string, unknown> }[] = [];
    const { dep } = abhaengigkeiten("probe", g, {
      async protokoll(a) { protokolle.push(a); },
      sd: { async angebotLoeschen() { throw new Error("nicht löschbar"); } },
    });
    const r = await erstelleAngebot(dep, g.order_id);
    assert.equal(r.ok, true);
    assert.equal(protokolle.length, 1);
    assert.match(protokolle[0].message, /Probe-Entwurf nicht gelöscht: nicht löschbar/);
    assert.equal(protokolle[0].objectId, g.order_id);
    assert.equal(protokolle[0].payload.sevdesk_order_id, "SD-ORDER-1");
  });

  it("eine Testorganisation bekommt auch bei „live“ nie ein festgeschriebenes Angebot", async () => {
    const g = mitOrg({ customer_number: "ZZTEST-NR-1" });
    const { dep, log } = abhaengigkeiten("live", g);
    const r = await erstelleAngebot(dep, g.order_id);
    assert.equal(r.ok && r.weg, "sevdesk-probe");
    assert.equal(log.some((x) => x.startsWith("festschreiben")), false);
    assert.ok(log.includes("loeschen:SD-ORDER-1"));
  });

  it("live: bekannter Kontakt wird benutzt (keine Suche, keine Anlage); erst Entwurf, dann festschreiben, dann eintragen; nichts wird gelöscht", async () => {
    const g = mitOrg({ sevdesk_contact_id: "C-BEKANNT" });
    const { dep, log, records } = abhaengigkeiten("live", g);
    const r = await erstelleAngebot(dep, g.order_id);
    assert.deepEqual(r, { ok: true, nummer: "AN-1232", gueltigBis: "2026-11-08T08:00:00Z", probe: false, weg: "sevdesk-live" });
    assert.deepEqual(log, ["begin", "speichern", "festschreiben:SD-ORDER-1", "record:live", "gueltigkeit"]);
    assert.equal(records[0].contactId, "C-BEKANNT");
    assert.equal(records[0].probe, false);
  });

  it("live: ohne bekannten Kontakt wird erst per Kundennummer gesucht; ein Treffer wird benutzt, es entsteht kein zweiter", async () => {
    const { dep, log, records } = abhaengigkeiten("live", GRUNDLAGE, { sd: { async kontakte() { log.push("kontakte"); return ["C-VORHANDEN"]; } } });
    const r = await erstelleAngebot(dep, GRUNDLAGE.order_id);
    assert.equal(r.ok, true);
    assert.deepEqual(log.slice(0, 3), ["begin", "kontakte", "speichern"]);
    assert.equal(log.includes("kontakt-anlegen"), false);
    assert.equal(records[0].contactId, "C-VORHANDEN");
  });

  it("live: zwei Kontakte zu einer Kundennummer — nichts raten, nichts anlegen: protokollieren (an der Organisation, mit beiden Kontakten), frei geben, Fehler", async () => {
    const protokolle: { objectId: string; payload: Record<string, unknown> }[] = [];
    const { dep, log } = abhaengigkeiten("live", GRUNDLAGE, {
      async protokoll(a) {
        protokolle.push(a);
        log.push(`protokoll:${a.message.slice(0, 40)}`);
      },
      sd: { async kontakte() { log.push("kontakte"); return ["A", "B"]; } },
    });
    const r = await erstelleAngebot(dep, GRUNDLAGE.order_id);
    assert.deepEqual(r, { ok: false, key: "quote_contact_ambiguous", status: 502 });
    assert.equal(log.includes("kontakt-anlegen"), false);
    assert.equal(log.includes("speichern"), false);
    assert.ok(log.some((x) => x.startsWith("protokoll:Zwei SevDesk-Kontakte")));
    assert.ok(log.includes("abort:contact_ambiguous"));
    assert.equal(protokolle[0].objectId, GRUNDLAGE.org.id);
    assert.deepEqual(protokolle[0].payload, { orders: ["MS-2026-0007"], contacts: ["A", "B"] });
  });

  it("live: scheitert das Speichern in SevDesk, bleibt nichts zurück — die Bestellung ist frei, das Team sieht den Fehler, es gibt nichts zu löschen", async () => {
    const e = Object.assign(new Error("SevDesk 422 /Order/Factory/saveOrder: x"), { status: 422, path: "/Order/Factory/saveOrder" });
    const { dep, log } = abhaengigkeiten("live", GRUNDLAGE, { sd: { async angebotSpeichern() { log.push("speichern"); throw e; } } });
    const r = await erstelleAngebot(dep, GRUNDLAGE.order_id);
    assert.deepEqual(r, { ok: false, key: "quote_failed", status: 502 });
    assert.ok(log.some((x) => x.startsWith("protokoll:SevDesk 422")));
    assert.ok(log.includes("abort:sevdesk_failed"));
    assert.equal(log.some((x) => x.startsWith("loeschen")), false);
    assert.equal(log.some((x) => x.startsWith("record")), false);
  });

  it("live: scheitert das Festschreiben, wird der noch offene Entwurf gelöscht; das Protokoll sagt, ob das gelang", async () => {
    const protokolle: Record<string, unknown>[] = [];
    const { dep, log } = abhaengigkeiten("live", GRUNDLAGE, {
      async protokoll(a) {
        protokolle.push(a.payload);
        log.push(`protokoll:${a.message.slice(0, 20)}`);
      },
      sd: { async festschreiben() { throw new Error("getPdf kaputt"); } },
    });
    const r = await erstelleAngebot(dep, GRUNDLAGE.order_id);
    assert.deepEqual(r, { ok: false, key: "quote_failed", status: 502 });
    assert.ok(log.includes("loeschen:SD-ORDER-1"));
    assert.ok(log.includes("abort:sevdesk_failed"));
    assert.equal(log.some((x) => x.startsWith("record")), false);
    assert.equal(protokolle[0].draft_removed, true);
    assert.equal(protokolle[0].sevdesk_order_id, "SD-ORDER-1");
  });

  it("live: scheitert auch das Löschen, steht das im Protokoll (draft_removed false) und die Bestellung wird trotzdem frei", async () => {
    const protokolle: Record<string, unknown>[] = [];
    const { dep, log } = abhaengigkeiten("live", GRUNDLAGE, {
      async protokoll(a) { protokolle.push(a.payload); },
      sd: { async festschreiben() { throw new Error("x"); }, async angebotLoeschen() { throw new Error("nicht löschbar"); } },
    });
    const r = await erstelleAngebot(dep, GRUNDLAGE.order_id);
    assert.equal(r.ok, false);
    assert.equal(protokolle[0].draft_removed, false);
    assert.ok(log.includes("abort:sevdesk_failed"));
  });

  it("live: scheitert der Eintrag nach dem Festschreiben, bleibt das Angebot in SevDesk (nicht löschbar): protokolliert, keine Freigabe — die Aufräumung übernimmt", async () => {
    const protokolle: Record<string, unknown>[] = [];
    const objekte: string[] = [];
    const { dep, log } = abhaengigkeiten("live", GRUNDLAGE, {
      async record() { log.push("record:live"); return { error: { message: "permission denied", code: "42501" } }; },
      async protokoll(a) { protokolle.push(a.payload); objekte.push(a.objectId); log.push("protokoll"); },
    });
    const r = await erstelleAngebot(dep, GRUNDLAGE.order_id);
    assert.deepEqual(r, { ok: false, key: "quote_record_failed", status: 500 });
    assert.deepEqual(objekte, [GRUNDLAGE.order_id]);
    assert.equal(log.some((x) => x.startsWith("loeschen")), false);
    assert.equal(log.some((x) => x.startsWith("abort")), false);
    assert.equal(protokolle[0].sevdesk_order_id, "SD-ORDER-1");
    assert.equal(protokolle[0].number, "AN-1232");
    assert.equal(protokolle[0].probe, false);
  });

  it("Probebetrieb: scheitert der Eintrag, wird der Entwurf gelöscht und die Bestellung frei", async () => {
    const g = mitOrg({ customer_number: "ZZTEST-NR-1" });
    const { dep, log } = abhaengigkeiten("probe", g, { async record() { log.push("record:probe"); return { error: { message: "quote_hash_mismatch", code: "P0001" } }; } });
    const r = await erstelleAngebot(dep, g.order_id);
    assert.deepEqual(r, { ok: false, key: "quote_hash_mismatch", status: 422 });
    assert.ok(log.indexOf("loeschen:SD-ORDER-1") > log.indexOf("record:probe"));
    assert.ok(log.includes("abort:record_failed"));
  });

  it("ein Fehler beim Freigeben oder beim Protokollieren ändert die Antwort an die Partnerin nicht", async () => {
    const { dep } = abhaengigkeiten("live", GRUNDLAGE, {
      async abort() { throw new Error("abort kaputt"); },
      async protokoll() { throw new Error("protokoll kaputt"); },
      sd: { async angebotSpeichern() { throw new Error("saveOrder kaputt"); } },
    });
    const r = await erstelleAngebot(dep, GRUNDLAGE.order_id);
    assert.deepEqual(r, { ok: false, key: "quote_failed", status: 502 });
  });

  it("ein Artikel, der sich nicht finden lässt, hält das Angebot nicht auf (die Zeile trägt dann nur den Namen)", async () => {
    const { dep, payloads } = abhaengigkeiten("live", GRUNDLAGE, { sd: { async artikel() { throw new Error("Stamm nicht erreichbar"); } } });
    const r = await erstelleAngebot(dep, GRUNDLAGE.order_id);
    assert.equal(r.ok, true);
    const pos = (payloads[0] as { orderPosSave: { part?: unknown }[] }).orderPosSave;
    assert.equal(pos.every((p) => !("part" in p)), true);
  });

  it("ohne API-Token gibt es keinen SevDesk-Weg: eine echte Organisation bekommt „nicht verfügbar“, eine Testorganisation die Simulation", async () => {
    const echt = abhaengigkeiten("live", GRUNDLAGE, {}, false);
    assert.deepEqual(await erstelleAngebot(echt.dep, GRUNDLAGE.order_id), { ok: false, key: "quote_unavailable", status: 503 });
    const test = abhaengigkeiten("live", mitOrg({ customer_number: "ZZTEST-1" }), {}, false);
    const r = await erstelleAngebot(test.dep, GRUNDLAGE.order_id);
    assert.equal(r.ok && r.weg, "simuliert");
    assert.equal(test.log.includes("speichern"), false);
  });
});
