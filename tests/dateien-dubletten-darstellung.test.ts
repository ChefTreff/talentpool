import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-062: In der Dateiliste schrumpfte die Textspalte am Handy auf wenige Pixel
 * (`flex-1` hat die Basis 0, die Marken daneben schrumpfen nicht), und der lange
 * Dateiname lief über die Nachbarn.
 *
 * QS-063: Bei den Dubletten war der **aktuelle Stand** ein gefüllter Primärknopf —
 * auf jeder Karte der Liste —, während die eigentliche nächste Aktion nur sekundär
 * war. Der Stand ist eine Auswahl, kein Primärknopf.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");

describe("Dateiliste am Handy (QS-062)", () => {
  const quelle = lies("app/(admin)/admin/produktion/dateien/DateienView.tsx");

  it("gibt der Textspalte eine Mindestbasis und lässt lange Namen umbrechen", () => {
    const spalte = /<span className="([^"]*)">\s*\{f\.label_de \?\? f\.filename\}/.exec(quelle)?.[1] ?? "";
    assert.ok(spalte.length > 0, "Textspalte der Zeile gefunden");
    assert.match(spalte, /\bbasis-48\b/);
    assert.match(spalte, /\bgrow\b/);
    assert.match(spalte, /\bbreak-words\b/);
    assert.match(spalte, /\bmin-w-0\b/);
    assert.doesNotMatch(spalte, /\bflex-1\b/, "flex-1 hat die Basis 0 und lässt die Spalte kollabieren");
  });

  it("zeigt den Dateinamen nicht zweimal, wenn er schon der Titel ist", () => {
    assert.match(quelle, /\{f\.label_de \? `\$\{f\.filename\} · ` : ""\}/);
  });
});

describe("Dubletten: Stand als Auswahl (QS-063)", () => {
  const quelle = lies("app/(admin)/admin/personen/dubletten/DuplicateActions.tsx");

  it("setzt keinen Knopf in Primärfarbe als Zustand", () => {
    assert.doesNotMatch(quelle, /<Button\b/);
    assert.doesNotMatch(quelle, /variant=\{[^}]*"primary"/);
  });

  it("bietet die drei Stände in einer Auswahl, die sofort gilt", () => {
    assert.match(quelle, /<Select\b/);
    for (const stand of ["open", "confirmed_dupe", "not_dupe"]) assert.match(quelle, new RegExp(`value: "${stand}"`));
    assert.match(quelle, /setDuplicateStatus\(id, e\.target\.value as DupStatus\)/);
  });

  it("trägt einen zugänglichen Namen in beiden Sprachen", () => {
    assert.match(quelle, /aria-label=\{labels\.state\}/);
    for (const sprache of ["de", "en"]) {
      const d = JSON.parse(lies(`lib/i18n/${sprache}.json`)).duplicatesAdmin as Record<string, string>;
      assert.ok(d.stateLabel?.trim(), sprache);
    }
    assert.match(lies("app/(admin)/admin/personen/dubletten/page.tsx"), /state: d\.stateLabel/);
  });
});
