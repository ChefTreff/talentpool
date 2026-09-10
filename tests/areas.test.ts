import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { AREAS, canEnterArea, safeNextPath, type AreaKey } from "@/lib/areas";

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
