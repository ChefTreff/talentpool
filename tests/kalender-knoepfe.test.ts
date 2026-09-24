import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * QS-043: Ein Termin kommt überall mit denselben drei Zeichen in den
 * Kalender. Das hält nur, wenn es genau **eine** Stelle gibt, die die Wege
 * baut — `components/ui/KalenderKnoepfe.tsx`. Vorher hatte die Übersicht alle
 * drei, der Slot auf der Session-Seite nur den Apple-Weg als Textlink.
 */

const KOMPONENTE = join("components", "ui", "KalenderKnoepfe.tsx");

function dateien(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return dateien(p);
    return e.name.endsWith(".tsx") ? [p] : [];
  });
}

const QUELLEN = ["app", "components"].flatMap(dateien).map((pfad) => ({ pfad, text: readFileSync(pfad, "utf8") }));

describe("Kalender-Knöpfe (QS-043)", () => {
  it("nur die gemeinsame Komponente baut Google- und Outlook-Adressen", () => {
    const funde = QUELLEN.filter(
      (q) => q.pfad !== KOMPONENTE && /\b(googleKalenderUrl|outlookKalenderUrl)\(/.test(q.text),
    ).map((q) => q.pfad);
    assert.deepEqual(funde, [], "bitte <KalenderKnoepfe termin={…} ics={…} /> statt eigener Links");
  });

  it("kein einzelner Termin-Link auf die .ics ohne die beiden anderen Wege", () => {
    // Erlaubt bleibt der eine Link „alle Termine" ohne Parameter: dafür gibt es
    // bei Google und Microsoft keinen Weg, nur die Datei.
    const funde = QUELLEN.filter((q) => q.pfad !== KOMPONENTE).flatMap((q) =>
      [...q.text.matchAll(/href=\{`\/api\/[a-z-]+\/kalender\?/g)].map(
        (m) => `${q.pfad}:${q.text.slice(0, m.index).split("\n").length}`,
      ),
    );
    assert.deepEqual(funde, []);
  });
});
