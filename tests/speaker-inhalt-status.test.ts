import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { inhaltsStatus } from "@/app/(speaker)/speaker/session/inhalt-status";

// SPK-050: der Status der Session-Inhalte in Konrads Worten.
const entwurf = { publish_status: "draft", hatFinal: false };
const entwurfMitInhalt = { publish_status: "draft", hatFinal: true };
const live = { publish_status: "published", hatFinal: true };

describe("Status der Session-Inhalte (SPK-050)", () => {
  it("zeigt die Inhalte des Teams als veröffentlicht, auch ohne Einreichung", () => {
    // Genau der Fall aus Konrads Sichtprüfung: „Noch nichts eingereicht",
    // obwohl die Inhalte final im Programm stehen.
    assert.equal(inhaltsStatus(live, null), "published");
  });

  it("unterscheidet leer von „vom Team eingetragen, noch nicht veröffentlicht“", () => {
    assert.equal(inhaltsStatus(entwurf, null), "none");
    assert.equal(inhaltsStatus(entwurfMitInhalt, null), "draft");
  });

  it("nennt die erste offene Einreichung „Eingereicht“", () => {
    assert.equal(inhaltsStatus(entwurf, { status: "submitted", is_change: false }), "submitted");
  });

  it("nennt eine Einreichung an einer veröffentlichten Session eine Änderung", () => {
    assert.equal(inhaltsStatus(live, { status: "submitted", is_change: false }), "change_submitted");
    // … und auch ohne den neuen Schlüssel (vor der Migration)
    assert.equal(inhaltsStatus(live, { status: "submitted" }), "change_submitted");
  });

  it("nennt eine Einreichung nach einer übernommenen eine Änderung, auch vor der Veröffentlichung", () => {
    assert.equal(inhaltsStatus(entwurfMitInhalt, { status: "submitted", is_change: true }), "change_submitted");
  });

  it("trennt „Veröffentlicht“ von „Änderung veröffentlicht“ über is_change", () => {
    assert.equal(inhaltsStatus(live, { status: "approved", is_change: false }), "published");
    assert.equal(inhaltsStatus(live, { status: "approved", is_change: true }), "change_published");
    // Ohne den Schlüssel bleibt es beim weniger genauen, aber richtigen „Veröffentlicht“.
    assert.equal(inhaltsStatus(live, { status: "approved" }), "published");
  });

  it("zeigt Übernommenes vor der Veröffentlichung als „Übernommen“", () => {
    assert.equal(inhaltsStatus(entwurfMitInhalt, { status: "approved", is_change: false }), "approved");
  });

  it("meldet eine zurückgewiesene Einreichung, egal ob live", () => {
    assert.equal(inhaltsStatus(entwurf, { status: "rejected" }), "rejected");
    assert.equal(inhaltsStatus(live, { status: "rejected", is_change: true }), "rejected");
  });

  it("behandelt eine ersetzte letzte Einreichung wie keine", () => {
    assert.equal(inhaltsStatus(live, { status: "superseded" }), "published");
    assert.equal(inhaltsStatus(entwurf, { status: "superseded" }), "none");
  });
});
