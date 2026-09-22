import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { MAX_SLOTS, rechneSlots } from "@/app/(partner)/partner/formate";

/**
 * Die Gespräche eines Interview Tables entstehen aus Tag, Zeitfenster und
 * Länge (Konrad, 17.09.). Drei Dinge daran sind leicht falsch und fallen in
 * der Oberfläche nicht auf, weil jeder Slot für sich plausibel aussieht:
 * der angeschnittene Rest am Ende, die Zeitzone und ein Tippfehler bei der
 * Länge. Deshalb stehen sie hier.
 */
describe("Interview Tables: Gespräche aus dem Zeitfenster", () => {
  it("schneidet den Rest am Ende ab, statt darüber hinauszulaufen", () => {
    // 10:00–11:15 bei 30 Minuten: zwei volle Gespräche, kein drittes bis 11:30.
    const slots = rechneSlots("2027-04-16", "10:00", "11:15", 30);
    assert.equal(slots.length, 2);
    assert.equal(slots[1].end.getTime() - slots[1].start.getTime(), 30 * 60_000);
    assert.ok(slots[1].end.getTime() <= slots[0].start.getTime() + 75 * 60_000);
  });

  it("legt die Gespräche in der Zeit des Summits, nicht in der des Rechners", () => {
    // 16.04.2027 ist Sommerzeit: 10:00 in Hamburg = 08:00 UTC. Ohne Umrechnung
    // stünde hier die Ortszeit des Browsers.
    const [erster] = rechneSlots("2027-04-16", "10:00", "10:30", 30);
    assert.equal(erster.start.toISOString(), "2027-04-16T08:00:00.000Z");
  });

  it("rechnet auch im Winter richtig", () => {
    // 15.01.2027 ist Normalzeit: 10:00 = 09:00 UTC. Ein fest verdrahtetes
    // „+02:00" wäre hier eine Stunde daneben.
    const [erster] = rechneSlots("2027-01-15", "10:00", "10:30", 30);
    assert.equal(erster.start.toISOString(), "2027-01-15T09:00:00.000Z");
  });

  it("bremst bei einem Tippfehler in der Länge", () => {
    // 09:00–18:00 bei 5 Minuten wären 108 Gespräche. Jedes ist ein eigener
    // RPC-Aufruf, und wer sich vertippt, müsste sie einzeln wieder löschen.
    const slots = rechneSlots("2027-04-16", "09:00", "18:00", 5);
    assert.equal(slots.length, MAX_SLOTS);
  });

  it("gibt nichts zurück, wenn die Eingabe keinen Sinn ergibt", () => {
    assert.deepEqual(rechneSlots("2027-04-16", "12:00", "10:00", 30), []);
    assert.deepEqual(rechneSlots("2027-04-16", "10:00", "11:00", 0), []);
    assert.deepEqual(rechneSlots("", "10:00", "11:00", 30), []);
    assert.deepEqual(rechneSlots("2027-04-16", "25:00", "11:00", 30), []);
    assert.deepEqual(rechneSlots("2027-04-16", "zehn", "11:00", 30), []);
  });
});
