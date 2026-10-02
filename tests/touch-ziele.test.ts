import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-057: Die Kit-Knöpfe waren 40 (`md`) und 32 px (`sm`) hoch; Design-Briefing
 * und Skill Regel 7 verlangen Touch-Ziele ≥ 44 px. Das Kit hebt sie auf Geräten
 * mit grobem Zeiger (`pointer-coarse:`) auf mindestens 44 px, an einer Stelle
 * für alle Portale, ohne das Desktop-Raster zu ändern.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const COARSE = "pointer-coarse:min-h-11";

describe("Touch-Ziele im Kit (QS-057)", () => {
  it("Button: beide Größen halten auf grobem Zeiger 44 px, das Desktop-Raster bleibt", () => {
    const quelle = lies("components/ui/Button.tsx");
    assert.match(quelle, new RegExp(`md: "h-10 px-5 ${COARSE}"`));
    assert.match(quelle, new RegExp(`sm: "h-8 px-3 ${COARSE}"`));
  });

  it("alle drei Knopfarten teilen sich dieselben Größen — eine Stelle genügt", () => {
    // Button, ButtonLink und ButtonDownload ziehen `sizes[size]`; baute eine
    // Variante ihre eigenen Höhen, bliebe sie bei 40/32.
    const quelle = lies("components/ui/Button.tsx");
    assert.equal((quelle.match(/sizes\[size\]/g) ?? []).length, 3);
    assert.equal((quelle.match(/\bh-(8|10)\b/g) ?? []).length, 2, "Höhen stehen nur in `sizes`");
  });

  it("Eingabefeld und Auswahl: ebenso, damit ein Knopf neben dem Feld nicht höher ist als das Feld", () => {
    assert.match(lies("components/ui/Input.tsx"), new RegExp(`"h-10 ${COARSE}"`));
    assert.match(lies("components/ui/Select.tsx"), new RegExp(`"h-10 ${COARSE} `));
  });

  it("kein Baustein im Kit setzt eine feste Höhe unter 44 px an etwas Bedienbarem, ohne die Untergrenze", () => {
    // Läuft über alle Kit-Dateien, damit ein neuer Baustein mit `h-9` oder `h-10`
    // auffällt. Ausnahme: das Schrittzeichen — dekorativ, nicht bedienbar.
    const AUSNAHMEN = new Set(["SchrittMarke.tsx"]);
    const verstoesse: string[] = [];
    for (const datei of readdirSync("components/ui").filter((f) => f.endsWith(".tsx") && !AUSNAHMEN.has(f))) {
      lies(`components/ui/${datei}`)
        .split("\n")
        .forEach((zeile, i) => {
          // Kommentare nennen die Zahlen („40 px“), tragen aber keine Klassen.
          if (/^\s*(\/\/|\*|\/\*)/.test(zeile)) return;
          if (/\bh-(8|9|10)\b/.test(zeile) && !zeile.includes(COARSE) && !/^\s*(md|sm):/.test(zeile)) {
            verstoesse.push(`${datei}:${i + 1}: ${zeile.trim().slice(0, 90)}`);
          }
        });
    }
    assert.deepEqual(verstoesse, []);
  });
});
