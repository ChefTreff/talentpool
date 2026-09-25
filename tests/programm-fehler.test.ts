import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { fehlerText } from "@/components/programme/fehler";

/**
 * Fehlertexte des Programm-Boards (LEAD-034). Das Zeitfenster aus der
 * Datenbank gehört in die Meldung — „Außerhalb eures Zeitfensters“ allein sagt
 * nicht, welches. Die Diagnose von Postgres dagegen nicht: bei einer
 * Überlappung stehen dort die Schlüssel beider Slots.
 */
const message = (key: string) =>
  ({
    outside_partner_window: "Außerhalb eures Zeitfensters",
    outside_stage_day: "Außerhalb der Öffnungszeiten",
    slot_overlap: "Überschneidet sich mit einem anderen Slot",
  })[key] ?? key;

describe("Fehlertexte des Boards", () => {
  it("hängt das Zeitfenster an", () => {
    assert.equal(
      fehlerText(message, { key: "outside_partner_window", detail: "14:30–19:00" }),
      "Außerhalb eures Zeitfensters (14:30–19:00)",
    );
    assert.equal(
      fehlerText(message, { key: "outside_stage_day", detail: "10:00–18:00" }),
      "Außerhalb der Öffnungszeiten (10:00–18:00)",
    );
  });

  it("lässt die Diagnose von Postgres weg", () => {
    assert.equal(
      fehlerText(message, {
        key: "slot_overlap",
        detail: "Key (stage_id, tstzrange(start_at, end_at, '[)'::text))=(4f1c…) conflicts with existing key",
      }),
      "Überschneidet sich mit einem anderen Slot",
    );
  });

  it("kommt ohne Detail aus", () => {
    assert.equal(fehlerText(message, { key: "outside_partner_window" }), "Außerhalb eures Zeitfensters");
  });
});
