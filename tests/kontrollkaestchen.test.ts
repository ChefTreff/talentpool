import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-065 (7): Die Beschriftung eines Kontrollkästchens ist seine Trefferfläche, und die stand in den
 * rund 70 Stellen des Portals bei 20 bis 28 px. Auf groben Zeigern jetzt 44: für von Hand gebaute Zeilen
 * über eine Basisregel in `globals.css`, für neue Stellen und die vier Kästchen ohne Beschriftung über
 * den Kit-Baustein `Checkbox`.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");

/** Alle `.tsx`-Dateien unter app/ und components/ (ohne die lokalen Vorschauseiten, die nie eingecheckt werden). */
function quellen(ordner: string, treffer: string[] = []): string[] {
  for (const e of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = `${ordner}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next" && !e.name.startsWith("vorschau-")) quellen(pfad, treffer);
    } else if (/\.tsx$/.test(e.name)) treffer.push(pfad);
  }
  return treffer;
}
const ALLE = quellen("app").concat(quellen("components"));

/** Jedes `<label …>…</label>`, das ein Kästchen oder Optionsfeld enthält: Fundstelle und Öffnungs-Tag. */
function labelsMitKaestchen(): { datei: string; zeile: number; tag: string }[] {
  const treffer: { datei: string; zeile: number; tag: string }[] = [];
  for (const datei of ALLE) {
    const text = lies(datei);
    for (const m of text.matchAll(/<label\b[^>]*>/g)) {
      const ende = text.indexOf("</label>", m.index);
      if (ende < 0) continue;
      if (/type="(checkbox|radio)"/.test(text.slice(m.index, ende))) {
        treffer.push({ datei, zeile: text.slice(0, m.index).split("\n").length, tag: m[0].replace(/\s+/g, " ") });
      }
    }
  }
  return treffer;
}

describe("Basisregel: jedes Label mit Kästchen ist am Handy 44 hoch (QS-065 (7))", () => {
  const css = lies("app/globals.css");
  const stelle = css.indexOf('label:has(input[type="checkbox"], input[type="radio"])');

  it("steht in `globals.css` und fasst Kontrollkästchen und Optionsfelder", () => {
    assert.ok(stelle > 0, "Regel gefunden");
    assert.match(css.slice(stelle, stelle + 120), /\{\s*min-height: 2\.75rem;\s*\}/);
  });

  it("gilt nur für grobe Zeiger, am Desktop bleibt die Zeile dicht", () => {
    const davor = css.slice(0, stelle);
    assert.ok(davor.lastIndexOf("@media (pointer: coarse)") > davor.lastIndexOf("@media (min-width"), "in der Medienabfrage für grobe Zeiger");
    // Zwischen der Medienabfrage und der Regel schließt keine Klammer.
    const abMedia = davor.slice(davor.lastIndexOf("@media (pointer: coarse)"));
    assert.equal((abMedia.match(/\}/g) ?? []).length, 0);
  });

  it("steht in `@layer base`: eine ausdrückliche Höhe an der Stelle gewinnt", () => {
    const davor = css.slice(0, stelle).replace(/\/\*[\s\S]*?\*\//g, "");
    const tiefe = (davor.match(/\{/g) ?? []).length - (davor.match(/\}/g) ?? []).length;
    // `@layer base {` und `@media (pointer: coarse) {` — zwei Ebenen tief.
    assert.equal(tiefe, 2);
    // Die nächste `@layer`-Angabe davor ist `base` (nicht `components` oder `utilities`).
    const ebenen = [...davor.matchAll(/@layer (\w+) \{/g)].map((m) => m[1]);
    assert.equal(ebenen[ebenen.length - 1], "base");
  });

  it("nimmt `min-height`, nicht Innenabstand: mehrzeilige Einwilligungstexte wachsen nicht", () => {
    assert.doesNotMatch(css.slice(stelle, stelle + 120), /padding/);
  });
});

describe("Kein Kästchen ohne Label, kein Label unter 44 (QS-065 (7))", () => {
  it("jedes Kästchen und Optionsfeld steht in einem `<label>` (oder in `Checkbox`, das eines baut)", () => {
    const ohne: string[] = [];
    for (const datei of ALLE) {
      if (datei === "components/ui/Checkbox.tsx") continue;
      const text = lies(datei);
      for (const m of text.matchAll(/type="(?:checkbox|radio)"/g)) {
        const davor = text.slice(Math.max(0, m.index - 900), m.index);
        const auf = davor.lastIndexOf("<label");
        if (auf < 0 || davor.slice(auf).includes("</label>")) {
          ohne.push(`${datei}:${text.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    assert.deepEqual(ohne, []);
  });

  it("kein Label mit Kästchen setzt eine feste Höhe unter 44 ohne `pointer-coarse:min-h-11`", () => {
    const zuNiedrig = labelsMitKaestchen().filter(({ tag }) => {
      const klassen = /className="([^"]*)"/.exec(tag)?.[1] ?? "";
      const klein = /(^|\s)(?:min-)?h-(?:[1-9]|10)(\s|$)/.test(klassen);
      return klein && !/pointer-coarse:(?:min-)?h-11/.test(klassen);
    });
    assert.deepEqual(zuNiedrig.map((t) => `${t.datei}:${t.zeile}`), []);
  });

  it("es gibt weiterhin Labels mit Kästchen, die die Prüfung erfasst (sonst prüfte sie nichts)", () => {
    assert.ok(labelsMitKaestchen().length >= 50);
  });
});

describe("Kit-Baustein Checkbox (QS-065 (7))", () => {
  const text = lies("components/ui/Checkbox.tsx");

  it("mit Beschriftung: eine Zeile, am Handy 44 über den Innenabstand, Kästchen an der ersten Zeile", () => {
    assert.match(text, /"flex cursor-pointer items-start gap-2 pointer-coarse:py-3"/);
    assert.match(text, /<span className=\{cn\("ct-label block"/);
    assert.match(text, /\{hint && <span className="ct-help block">\{hint\}<\/span>\}/);
  });

  it("ohne Beschriftung: 44 × 44 mit negativem Rand, das Layout misst weiter 20", () => {
    assert.match(text, /"-m-3 flex size-11 cursor-pointer items-center justify-center"/);
    assert.match(text, /className="size-5 shrink-0"/);
  });

  it("der Typ steht fest hinter den übrigen Eigenschaften: ein `type` von außen überschreibt ihn nicht", () => {
    assert.match(text, /<input \{\.\.\.rest\} type="checkbox"/);
    assert.match(text, /Omit<ComponentProps<"input">, "type" \| "children">/);
  });

  it("gesperrt wird grau und zeigt es am Zeiger", () => {
    assert.match(text, /rest\.disabled && "cursor-not-allowed text-muted"/);
  });

  it("steht in der Sammelstelle des Kits", () => {
    assert.match(lies("components/ui/index.ts"), /export \{ Checkbox \} from "\.\/Checkbox";/);
  });

  it("die vier Kästchen ohne Beschriftung nutzen ihn (vorher 20 × 20 px Trefferfläche)", () => {
    const stellen: [string, number][] = [
      ["app/(admin)/admin/partner/vorlagen/TemplateEditor.tsx", 2],
      ["app/(partner)/partner/checkliste/ChecklistView.tsx", 1],
      ["app/(partner)/partner/shop/MerchDialog.tsx", 1],
    ];
    for (const [datei, n] of stellen) {
      const t = lies(datei);
      assert.equal((t.match(/<Checkbox\b/g) ?? []).length, n, datei);
      assert.match(t, /import \{ Checkbox \} from "@\/components\/ui\/Checkbox";/, datei);
    }
  });

  it("die beiden Filterzeilen mit `min-h-10` heben sich am Handy auf 44", () => {
    for (const datei of ["app/(admin)/admin/speaker/SpeakerListe.tsx", "app/(speaker-leads)/speaker-leads/PipelineView.tsx"]) {
      assert.match(lies(datei), /min-h-10 items-center gap-2 self-end ct-label text-ink pointer-coarse:min-h-11/, datei);
    }
  });
});
