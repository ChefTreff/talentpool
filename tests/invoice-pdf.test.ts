import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { PDFDocument, PDFRawStream, PDFArray, decodePDFRawStream } from "pdf-lib";
import { buildInvoicePdf, type InvoiceClaim } from "@/lib/expenses/invoice-pdf";

/** Sichtbarer Text der Seite — pdf-lib schreibt die Strings hexkodiert. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  let out = "";
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const parts =
      contents instanceof PDFArray
        ? contents.asArray().map((ref) => page.node.context.lookup(ref))
        : [contents];
    for (const part of parts) {
      if (!(part instanceof PDFRawStream)) continue;
      const raw = Buffer.from(decodePDFRawStream(part).decode()).toString("latin1");
      for (const m of raw.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
        out += `${Buffer.from(m[1], "hex").toString("latin1")}\n`;
      }
    }
  }
  return out;
}

const CLAIM: InvoiceClaim = {
  positions: [
    { date: "2027-04-15", category: "train", description: "ICE Hamburg", amount_cents: 128_40 },
    { date: "2027-04-17", category: "local_transport", description: "Taxi", amount_cents: 23_50 },
  ],
  amount_cents: 151_90,
  currency: "EUR",
  invoice_no: "RK-2026-0004",
  bank_masked: "DE****3000",
  bank_holder: "Bea Beispiel",
  submitted_at: "2026-09-10T14:05:42.809Z",
  created_at: "2026-09-10T14:05:42.640Z",
};

const STRINGS: Record<string, string> = {
  invoiceHeading: "Auslagenrechnung",
  invoiceNumber: "Rechnungsnummer",
  invoiceDate: "Datum",
  invoiceFrom: "Von",
  invoiceTo: "An",
  invoicePositions: "Positionen",
  invoiceTotal: "Summe",
  invoiceBank: "Bankverbindung",
  invoiceFooter: "Kein Ausweis von Umsatzsteuer.",
  category_train: "Bahn",
  category_local_transport: "ÖPNV / Taxi",
};

const SPEAKER = { name: "Bea Beispiel", email: "delivered+b8speaker@resend.dev" };

describe("Auslagenrechnung", () => {
  it("schreibt Beträge mit Währung, nicht „undefined“", async () => {
    const text = await pdfText(
      await buildInvoicePdf({
        claim: CLAIM,
        speaker: SPEAKER,
        strings: STRINGS,
        dateLocale: "de-DE",
      }),
    );
    assert.ok(!text.includes("undefined"), "kein undefined im Dokument");
    assert.match(text, /128,40 EUR/);
    assert.match(text, /151,90 EUR/);
  });

  it("nennt reine Kalendertage ohne Zeitzonen-Versatz", async () => {
    // Der 15.04. muss auch westlich von Greenwich der 15.04. bleiben.
    const before = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      const text = await pdfText(
        await buildInvoicePdf({
          claim: CLAIM,
          speaker: SPEAKER,
          strings: STRINGS,
          dateLocale: "de-DE",
        }),
      );
      assert.match(text, /15\.04\.2027/);
      assert.match(text, /17\.04\.2027/);
    } finally {
      process.env.TZ = before;
    }
  });

  it("nimmt nur die maskierte IBAN auf", async () => {
    const text = await pdfText(
      await buildInvoicePdf({
        claim: CLAIM,
        speaker: SPEAKER,
        strings: STRINGS,
        dateLocale: "de-DE",
      }),
    );
    assert.ok(text.includes("DE****3000"));
    assert.ok(!/DE\d{20}/.test(text), "keine vollständige IBAN");
  });
});
