import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-064 (2) und (3): Stage-Lead-Pipeline am Handy (Speaker-Chat 02.10., 375 px, grober Zeiger).
 * (2) Der Name in der ersten Spalte war ein 20 px hoher Textknopf in einer 56-px-Zeile — er soll die ganze
 * Zelle als Ziel bekommen; die Tabellen stapeln unter 640 px (QS-058). (3) Die vier Kennzahlen-Kacheln der
 * Übersicht standen am Handy einspaltig.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const PIPELINE = lies("app/(speaker-leads)/speaker-leads/PipelineView.tsx");
const CSS = lies("app/globals.css");

describe("Das Ziel des Namens reicht bis an den Rand der Zelle (QS-064 (2))", () => {
  const regel = /\.ct-ziel::after \{([^}]*)\}/.exec(CSS)?.[1] ?? "";

  it("`.ct-ziel` legt eine Fläche über das Elternelement und zeigt den Zeiger", () => {
    assert.match(CSS, /\.ct-ziel \{\s*cursor: pointer;\s*\}/);
    assert.match(regel, /content: "";/);
    assert.match(regel, /position: absolute;/);
    assert.match(regel, /inset: 0;/);
  });

  it("steht in `@layer components` wie die übrigen Rollen, nicht darüber", () => {
    const davor = CSS.slice(0, CSS.indexOf(".ct-ziel {")).replace(/\/\*[\s\S]*?\*\//g, "");
    const ebenen = [...davor.matchAll(/@layer (\w+) \{/g)].map((m) => m[1]);
    assert.equal(ebenen[ebenen.length - 1], "components");
  });

  it("die drei Namensknöpfe der Pipeline tragen es (Fällig-Liste, Pipeline, Bestätigt)", () => {
    assert.equal((PIPELINE.match(/className="ct-link ct-ziel text-left"/g) ?? []).length, 3);
    // Kein Namensknopf ohne Ziel: ein `ct-link text-left` ohne `ct-ziel` wäre die alte 20-px-Fläche.
    assert.doesNotMatch(PIPELINE, /className="ct-link text-left"/);
  });

  it("jeder dieser Knöpfe steht in einem `relative` Elternelement, sonst deckte die Fläche die Seite", () => {
    assert.equal((PIPELINE.match(/<Td className="relative">/g) ?? []).length, 2);
    assert.match(PIPELINE, /<li key=\{s\.id\} className="relative flex flex-wrap items-center gap-2 pointer-coarse:py-3">/);
  });
});

describe("Die Pipeline-Tabellen stapeln am Handy (QS-064 (2), QS-058)", () => {
  it("beide Tabellen sind `stapeln`", () => {
    assert.equal((PIPELINE.match(/<Table stapeln>/g) ?? []).length, 2);
    assert.doesNotMatch(PIPELINE, /<Table>/);
  });

  it("jede Zelle außer dem Namen trägt ihre Beschriftung (6 + 6)", () => {
    assert.equal((PIPELINE.match(/<Td [^>]*\blabel=\{/g) ?? []).length, 12);
  });

  it("gestapelte Zellen nehmen die volle Breite, auch mit `max-w-72` und `max-w-80`", () => {
    assert.match(CSS, /\.ct-stapeln td \{[^}]*max-width: none;/);
  });
});

describe("Kennzahlen-Kacheln der Stage-Lead-Übersicht (QS-064 (3))", () => {
  it("am Handy zwei Spalten, ab 1024 px vier", () => {
    const t = lies("app/(speaker-leads)/speaker-leads/UebersichtAnsicht.tsx");
    assert.match(t, /<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">\s*\{kacheln\.map/);
    // Der Zwischenschritt `sm:grid-cols-2` ist überflüssig, die Basis ist schon zweispaltig.
    assert.doesNotMatch(t, /sm:grid-cols-2 lg:grid-cols-4">\s*\{kacheln/);
  });
});
