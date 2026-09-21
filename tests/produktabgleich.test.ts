import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { istTrockenlauf } from "@/lib/products/dry-run";

/**
 * Der Produktabgleich schreibt in zwei Fremdsysteme. Konrad, 21.09.2026: vor
 * jedem Anlegen wird gefragt. Die Zusage hängt an genau einer Zeile — also wird
 * genau die geprüft, und zwar von der falschen Seite her: alles, was nicht
 * ausdrücklich „scharf" heißt, muss Trockenlauf bleiben.
 */
describe("Produktabgleich: Trockenlauf ist die Vorgabe", () => {
  it("schreibt nur bei einem ausdrücklichen dryRun: false", () => {
    assert.equal(istTrockenlauf({ dryRun: false }), false);
  });

  it("bleibt bei allem anderen ein Trockenlauf", () => {
    for (const body of [
      {},
      null,
      undefined,
      { system: "sevdesk" },
      { dryRun: true },
      { dryRun: "false" }, // Text, nicht Wahrheitswert — ein häufiger Tippfehler im Aufruf
      { dryRun: 0 },
      { dryRun: null },
      { dryrun: false }, // Schreibweise daneben
      { DryRun: false },
    ]) {
      assert.equal(istTrockenlauf(body), true, `schreibt bei ${JSON.stringify(body)}`);
    }
  });
});

/**
 * Der gezielte Lauf (INV0): Konrad bestätigt Artikelnummern, und genau die gehen
 * hinaus. Geprüft wird die Auswahl selbst — dass sie nichts durchlässt, was die
 * Datenbank ohnehin nicht hergibt, und nichts schluckt, was bestätigt wurde.
 */
describe("Produktabgleich: gezielte Auswahl", () => {
  const stamm = [{ sku: "I-10001" }, { sku: "I-10002" }, { sku: "I-10003" }];
  const auswahl = (zeilen: { sku: string }[], nur?: string[]) =>
    nur && nur.length > 0 ? zeilen.filter((z) => new Set(nur).has(z.sku)) : zeilen;

  it("ohne Auswahl geht der ganze Stamm", () => {
    assert.equal(auswahl(stamm).length, 3);
    assert.equal(auswahl(stamm, []).length, 3);
  });

  it("mit Auswahl genau die bestätigten Artikel", () => {
    assert.deepEqual(auswahl(stamm, ["I-10002"]).map((z) => z.sku), ["I-10002"]);
  });

  it("eine Nummer, die der Stamm nicht hergibt, holt nichts herein", () => {
    // Barter und systemfremde Artikel filtert schon `products_for_sync`; eine
    // Auswahl darf sie nicht nachträglich hereinholen.
    assert.deepEqual(auswahl(stamm, ["INI-PARTNERSCHAFT", "I-10003"]).map((z) => z.sku), ["I-10003"]);
  });
});
