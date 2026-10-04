import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-054-Rest (Teil): Wo Karten die Abschnitte einer Seite sind, trägt `CardHeader` die Ebene `h2` (`.ct-h2`) —
 * sonst springt die Gliederung von `h1` auf `h3`. Die Umstellung läuft Seite für Seite „beim nächsten Anfassen“;
 * hier stehen die Seiten, die schon umgestellt sind. Eine Seite fällt nicht zurück, ohne dass dieser Test es sagt.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");

/** Jedes `<CardHeader …>`-Öffnungs-Tag einer Datei (mehrzeilig). */
const koepfe = (pfad: string) => [...lies(pfad).matchAll(/<CardHeader\b[^>]*?(?:\/>|>)/gs)].map((m) => m[0]);

describe("CardHeader als Abschnittskopf (QS-054)", () => {
  const UMGESTELLT: [string, number][] = [
    ["app/(admin)/admin/fotos/page.tsx", 2], // Events, Löschwünsche — beide Abschnitte der Seite
    ["app/(admin)/admin/partner/vorlagen/TemplateEditor.tsx", 2], // Liste und Editor — beide Abschnitte der Seite
  ];
  for (const [datei, n] of UMGESTELLT) {
    it(`${datei}: alle ${n} Köpfe tragen \`ebene="h2"\``, () => {
      const alle = koepfe(datei);
      assert.equal(alle.length, n, "Anzahl der Köpfe");
      for (const k of alle) assert.match(k, /ebene="h2"/);
    });
  }

  it("das Kit kennt den Schalter und hält h3 als Vorgabe", () => {
    const card = lies("components/ui/Card.tsx");
    assert.match(card, /ebene = "h3"/);
    assert.match(card, /ebene === "h2" \? "ct-h2 text-ink" : "ct-h3 text-ink"/);
  });
});
