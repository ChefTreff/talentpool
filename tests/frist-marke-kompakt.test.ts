import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * PART-094: Auf 375 px brach die kompakte Fristmarke („Deadline · noch 168 Tage“ samt
 * Datum) auf drei Zeilen um, und die Checkliste trug acht gleiche Marken von je etwa
 * 40 px — die Aufgabe selbst trat zurück. Unter 640 px steht sie jetzt in einer Zeile.
 */

const quelle = readFileSync("components/ui/FristMarke.tsx", "utf8");
/** Der kompakte Zweig der Komponente (zwischen `if (kompakt)` und dem Abschnittskopf). */
const kompakt = quelle.slice(quelle.indexOf("if (kompakt) {"), quelle.indexOf('<div\n      className={cn(\n        "inline-flex shrink-0 flex-col'));

describe("FristMarke kompakt (PART-094)", () => {
  it("bricht erst ab 640 px um — am Handy bleibt sie eine Zeile", () => {
    assert.ok(kompakt.length > 100, "kompakter Zweig gefunden");
    assert.match(kompakt, /"inline-flex shrink-0 items-baseline gap-x-1\.5 rounded-ct-sm px-2 py-0\.5 sm:flex-wrap"/);
    assert.doesNotMatch(kompakt, /"inline-flex shrink-0 flex-wrap/, "kein unbedingtes flex-wrap mehr");
  });

  it("zeigt ab 640 px Wort und Restzeit wie bisher", () => {
    assert.match(kompakt, /<span className="max-sm:hidden">\s*\{t\.label\}\s*\{zusatz && <> · \{zusatz\}<\/>\}\s*<\/span>/);
  });

  it("zeigt darunter bei offener Frist das Wort, sonst den Stand (bald, vorbei, erledigt)", () => {
    assert.match(kompakt, /<span className="sm:hidden">\{stand === "offen" \? t\.label : \(zusatz \?\? t\.label\)\}<\/span>/);
  });

  it("lässt Datum, Farbe und Stand-Wort stehen — der Zustand bleibt in Form und Farbe", () => {
    assert.match(kompakt, /TON\[stand\]/);
    assert.match(kompakt, /<span className="ct-label tabular-nums">\{dateText\}<\/span>/);
  });

  it("rührt den Kopf des Abschnitts nicht an", () => {
    const kopf = quelle.slice(quelle.indexOf('"inline-flex shrink-0 flex-col items-end'));
    assert.match(kopf, /ct-h2 tabular-nums/);
    assert.doesNotMatch(kopf, /max-sm:hidden|sm:hidden/);
  });
});
