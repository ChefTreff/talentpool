import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-054-Rest (Teil): Wo Karten die Abschnitte einer Seite sind, trägt `CardHeader` die Ebene `h2` (`.ct-h2`) —
 * sonst springt die Gliederung von `h1` auf `h3`. Die Umstellung läuft Seite für Seite „beim nächsten Anfassen“;
 * hier stehen die Seiten, die schon umgestellt sind. Eine Seite fällt nicht zurück, ohne dass dieser Test es sagt.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");

/** Anzahl aller `<CardHeader`-Aufrufe und derer, die `ebene="h2"` als erste Eigenschaft tragen (so steht es in den umgestellten Seiten). */
const zaehle = (pfad: string) => {
  const t = lies(pfad);
  return { alle: (t.match(/<CardHeader\b/g) ?? []).length, h2: (t.match(/<CardHeader\s+ebene="h2"/g) ?? []).length };
};

describe("CardHeader als Abschnittskopf (QS-054)", () => {
  const UMGESTELLT: [string, number][] = [
    ["app/(admin)/admin/fotos/page.tsx", 2], // Events, Löschwünsche — beide Abschnitte der Seite
    ["app/(admin)/admin/partner/vorlagen/TemplateEditor.tsx", 2], // Liste und Editor — beide Abschnitte der Seite
  ];
  for (const [datei, n] of UMGESTELLT) {
    it(`${datei}: alle ${n} Köpfe tragen \`ebene="h2"\``, () => {
      const z = zaehle(datei);
      assert.equal(z.alle, n, "Anzahl der Köpfe");
      assert.equal(z.h2, n, "alle auf h2");
    });
  }

  it("das Kit kennt den Schalter und hält h3 als Vorgabe", () => {
    const card = lies("components/ui/Card.tsx");
    assert.match(card, /ebene = "h3"/);
    assert.match(card, /ebene === "h2" \? "ct-h2 text-ink" : "ct-h3 text-ink"/);
  });
});
