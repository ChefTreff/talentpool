import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { AREAS, areasFor, canEnterArea, landingPathFor, safeNextPath, type AreaKey } from "@/lib/areas";

/**
 * `requireAnyArea` selbst braucht eine Session; die Entscheidung dahinter ist
 * aber rein: „öffnet dieses Rollenset einen der genannten Bereiche?"
 */
function opensAny(keys: AreaKey[], roles: string[], isStaff = false): boolean {
  return keys.some((key) => {
    const area = AREAS.find((a) => a.key === key);
    return area ? canEnterArea(area, roles, isStaff) : false;
  });
}

const BOARD: AreaKey[] = ["admin", "speaker-leads"];

describe("Bereichs-Gate", () => {
  it("lässt das Team und die Speaker-Leads ans Board", () => {
    assert.equal(opensAny(BOARD, ["speaker_manager"]), true);
    assert.equal(opensAny(BOARD, ["area_lead_speaker"]), true);
    assert.equal(opensAny(BOARD, ["admin"]), true);
    // Team im Sinne von `is_staff()` — die Rolle steht in SQL, nicht hier.
    assert.equal(opensAny(BOARD, ["programme_team"], true), true);
  });

  it("hält alle anderen draußen", () => {
    assert.equal(opensAny(BOARD, []), false);
    assert.equal(opensAny(BOARD, ["speaker"]), false);
    assert.equal(opensAny(BOARD, ["speaker_assistant"]), false);
    assert.equal(opensAny(BOARD, ["volunteer", "partner_contact"]), false);
  });

  it("kennt keinen erfundenen Bereich", () => {
    assert.equal(opensAny(["gibtesnicht" as AreaKey], ["admin"]), false);
  });

  it("öffnet Talent für jede eingeloggte Person, Speaker aber nicht", () => {
    assert.equal(opensAny(["talent"], []), true);
    assert.equal(opensAny(["speaker"], []), false);
  });
});

describe("Rücksprungziel nach dem Login", () => {
  it("nimmt Pfade auf diesem Host", () => {
    assert.equal(safeNextPath("/speaker-leads/board"), "/speaker-leads/board");
  });

  it("verwirft alles, was woanders hinführt", () => {
    for (const evil of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "speaker-leads/board",
      "",
      null,
    ]) {
      assert.equal(safeNextPath(evil), "/profil", `abgelehnt: ${String(evil)}`);
    }
  });
});

describe("Einstieg nach dem Login (F1)", () => {
  it("führt in den eigenen Fachbereich, nicht ins Teilnehmer-Portal", () => {
    // Jede angemeldete Person hat zusätzlich das Teilnehmer-Portal — es darf
    // den Fachbereich nicht verdrängen.
    assert.equal(landingPathFor(areasFor(["speaker"], false)), "/speaker");
    assert.equal(landingPathFor(areasFor(["partner_contact"], false)), "/partner");
    assert.equal(landingPathFor(areasFor(["volunteer"], false)), "/volunteers");
    assert.equal(landingPathFor(areasFor(["production_team"], false)), "/produktion");
  });

  it("bleibt beim Teilnehmer-Portal, wenn es der einzige Bereich ist", () => {
    assert.equal(landingPathFor(areasFor([], false)), "/profil");
  });

  it("führt das Team nach Admin, auch mit Testrollen in anderen Bereichen", () => {
    // Ohne diese Regel entschiede die Reihenfolge in AREAS: Speaker steht vor
    // Admin, also wäre Konrad mit seinen Testrollen im Speaker-Portal gelandet.
    assert.equal(landingPathFor(areasFor([], true)), "/admin");
    assert.equal(landingPathFor(areasFor(["speaker", "partner_contact"], true)), "/admin");
    // Ohne Admin gilt weiter der erste eigene Bereich.
    assert.equal(landingPathFor(areasFor(["speaker", "partner_contact"], false)), "/speaker");
  });
});

describe("Bereiche zählen (F1: Umschalter erst ab zwei)", () => {
  it("gibt einer reinen Teilnehmerin genau ihr Portal", () => {
    assert.deepEqual(
      areasFor([], false).map((a) => a.key),
      ["talent"],
    );
  });

  it("verdrängt das Teilnehmer-Portal, sobald es einen Fachbereich gibt", () => {
    // Sonst stünde über jedem Speaker-Portal „Talent | Speaker" — genau die
    // Aufzählung, die weg soll (Konrads Entscheidung 13.09.).
    assert.deepEqual(
      areasFor(["speaker"], false).map((a) => a.key),
      ["speaker"],
    );
    assert.deepEqual(
      areasFor(["volunteer"], false).map((a) => a.key),
      ["volunteers"],
    );
  });

  it("zeigt dem Team weiterhin alle seine Bereiche", () => {
    assert.deepEqual(
      areasFor(["speaker_manager"], true).map((a) => a.key),
      ["speaker-leads", "admin"],
    );
  });

  it("lässt den Zugang zum Profil unberührt", () => {
    // `areasFor` steuert nur Umschalter und Einstieg — die Tür zu /profil
    // öffnet weiterhin `canEnterArea`.
    const talent = AREAS.find((a) => a.key === "talent")!;
    assert.equal(canEnterArea(talent, ["speaker"], false), true);
    assert.equal(canEnterArea(talent, [], false), true);
  });
});
