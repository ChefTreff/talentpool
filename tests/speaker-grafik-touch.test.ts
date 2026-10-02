import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * SPK-079: Der Regler „Größe“ in der Grafik-Maske war 16 px hoch — die Kit-Regel
 * aus QS-057 (`pointer-coarse:min-h-11`) gilt nur für Button, Input und Select,
 * ein nacktes `<input type="range">` fiel durch. Er hält jetzt auf Geräten mit
 * grobem Zeiger 44 px; am Rechner bleibt er, wie er war.
 */
describe("Grafik-Maske: Touch-Ziel des Reglers (SPK-079)", () => {
  it("der Zoom-Regler hat auf grobem Zeiger 44 px Höhe", () => {
    const quelle = readFileSync("app/(speaker)/speaker/grafik/GrafikMaske.tsx", "utf8");
    const start = quelle.indexOf('type="range"');
    assert.ok(start >= 0, "der Regler fehlt");
    const ende = quelle.indexOf("/>", start);
    const regler = quelle.slice(start, ende);
    assert.match(regler, /className="[^"]*\bpointer-coarse:h-11\b/);
    // nur für grobe Zeiger: eine feste Höhe ohne Variante änderte den Desktop
    assert.doesNotMatch(regler, /className="[^"]*(^|\s)h-11\b/);
  });
});
