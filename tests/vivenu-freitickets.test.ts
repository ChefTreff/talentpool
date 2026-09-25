import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { istLebendesTicket } from "@/lib/vivenu/naming";

describe("Idempotenz der Freitickets über `batchId` (SPK-068)", () => {
  it("ein storniertes Ticket zählt nicht als „gibt es schon“", () => {
    // Der Fall aus der Sandbox-Kettenprüfung vom 25.09.2026: nach
    // `POST /tickets/{id}/invalidate` liefert `GET /tickets?batch=…` das Ticket
    // weiterhin aus, mit `status: "INVALID"`. Würde es als vorhanden gelten,
    // schriebe `set_ticket_issued` dessen toten Barcode in unsere Zeile — das
    // Portal zeigte ein gültiges Ticket, am Einlass wäre es keines.
    assert.equal(istLebendesTicket("INVALID"), false);
    assert.equal(istLebendesTicket("CANCELLED"), false);
    assert.equal(istLebendesTicket("CANCELED"), false);
    assert.equal(istLebendesTicket("REFUNDED"), false);
  });

  it("ein Ticket, das noch keines ist, zählt auch nicht", () => {
    // Ohne Barcode käme das Ausstellen nie durch (`barcode_missing`), und jeder
    // erneute Versuch fände wieder nur diesen Platzhalter.
    assert.equal(istLebendesTicket("RESERVED"), false);
    assert.equal(istLebendesTicket("BLANK"), false);
  });

  it("gültige und benutzte Tickets zählen — sonst entstünde ein zweites", () => {
    assert.equal(istLebendesTicket("VALID"), true);
    assert.equal(istLebendesTicket("DETAILSREQUIRED"), true);
    assert.equal(istLebendesTicket("CHECKEDIN"), true);
    assert.equal(istLebendesTicket("CHECKED_IN"), true);
    assert.equal(istLebendesTicket("BLOCKED"), true);
  });

  it("Schreibweise und Leerraum entscheiden nicht", () => {
    assert.equal(istLebendesTicket(" valid "), true);
    assert.equal(istLebendesTicket("Invalid"), false);
  });

  it("unbekannt heißt: nicht vorhanden, also neu anlegen", () => {
    // Bewusst die Richtung, in der ein zweites Ticket entsteht statt eines
    // toten Barcodes: das zweite sieht das Team, den toten niemand.
    assert.equal(istLebendesTicket("WASAUCHIMMER"), false);
    assert.equal(istLebendesTicket(null), false);
    assert.equal(istLebendesTicket(undefined), false);
  });
});
