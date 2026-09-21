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
