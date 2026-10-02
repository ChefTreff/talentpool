import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { compile } from "tailwindcss";

/**
 * QS-065 (5): Die Zeile einer Tabelle erkennt ihre Bedienelemente selbst und ist dann 56 hoch
 * (Konrads Regel vom 17.09.2026). Gezählt waren 28 Zeilen mit Knopf oder Feld ohne `controls`
 * gegenüber 10 mit — die Regel galt nur dort, wo jemand sie kannte. Ausnahme ist ausdrücklich:
 * `dicht` an der Zeile einer Arbeitstabelle (Programm, Regie).
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const TABLE = lies("components/ui/Table.tsx");
const ERKENNUNG = /"(has-\[[^"]+\]:\[&>td\]:h-14)"/.exec(TABLE)?.[1] ?? "";

/** Alle `.tsx`-Dateien unter app/ und components/. */
function quellen(ordner: string, treffer: string[] = []): string[] {
  for (const e of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = `${ordner}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next") quellen(pfad, treffer);
    } else if (/\.tsx$/.test(e.name)) treffer.push(pfad);
  }
  return treffer;
}

describe("Die Zeile erkennt Bedienelemente selbst (QS-065)", () => {
  it("trägt die Erkennung als eine ganze Klasse, wie Tailwind sie liest", () => {
    assert.ok(ERKENNUNG, "Klasse in Table.tsx gefunden");
    assert.match(TABLE, /const ERKENNT_BEDIENELEMENTE = "has-\[/);
  });

  it("Tailwind übersetzt sie in eine Regel für die Zellen der Zeile (sonst fällt sie stillschweigend weg)", async () => {
    const tw = await compile("@theme { --spacing: 0.25rem; } @tailwind utilities;");
    const css = tw.build([ERKENNUNG]);
    // Die Zeile mit einem Bedienelement …
    assert.match(css, /:has\(:is\(button, select, textarea, input:not\(\[type=hidden\]\), a\[data-knopf\]\)\) > td \{/);
    // … macht ihre Zellen 56 hoch (14 × 4 px), und es ist nur diese eine Regel.
    assert.match(css, /height: calc\(var\(--spacing\) \* 14\)/);
    assert.equal((css.match(/> td \{/g) ?? []).length, 1);
  });

  it("erkennt Knopf, Auswahl, Textfeld, jedes Feld außer dem versteckten und den Link in Knopfgestalt", () => {
    for (const el of ["button", "select", "textarea", "input:not([type=hidden])", "a[data-knopf]"]) {
      assert.ok(ERKENNUNG.includes(el), `${el} fehlt in der Erkennung`);
    }
  });

  it("ButtonLink und ButtonDownload tragen den Marker, der Textlink nicht", () => {
    const knoepfe = lies("components/ui/Button.tsx");
    assert.match(knoepfe, /<Link \{\.\.\.rest\} data-knopf=""/);
    assert.match(knoepfe, /<a \{\.\.\.rest\} download data-knopf=""/);
    // Ein Name als Link ist Text, kein Bedienelement: die Zeile bliebe sonst bei jedem Detail-Link 56 hoch.
    assert.doesNotMatch(ERKENNUNG, /(^|[,\[])a[,\]]/);
  });

  it("`controls` bleibt für das, was CSS nicht sieht, und hat Vorrang vor der Erkennung", () => {
    assert.match(TABLE, /controls && "\[&>td\]:h-14"/);
    assert.match(TABLE, /!controls && !dicht && ERKENNT_BEDIENELEMENTE/);
  });

  it("die Zelle selbst bleibt bei 44 (reine Datenzeile)", () => {
    assert.match(TABLE, /"h-11 px-4 align-middle text-ink"/);
  });

  it("gestapelte Tabellen am Handy setzen die Höhe zurück: die unlayered Regel schlägt auch die Erkennung", () => {
    const css = lies("app/globals.css");
    const stelle = css.indexOf(".ct-stapeln td {");
    assert.ok(stelle > 0, "Regel gefunden");
    assert.match(css.slice(stelle, stelle + 200), /height: auto;/);
    // Unlayered, nicht in `@layer`: sonst gälte die Utility der Zeile vor der Rückstellung. Außerhalb der
    // Medienabfrage selbst liegt keine Klammer offen, also steht die Regel genau eine Ebene tief.
    const davor = css.slice(0, stelle).replace(/\/\*[\s\S]*?\*\//g, "");
    const tiefe = (davor.match(/\{/g) ?? []).length - (davor.match(/\}/g) ?? []).length;
    assert.equal(tiefe, 1);
  });
});

describe("Die Ausnahme `dicht` ist ausdrücklich und selten (QS-065)", () => {
  const DICHT = quellen("app")
    .concat(quellen("components"))
    .filter((f) => /<Tr\b[^>]*\bdicht\b/.test(lies(f)))
    .sort();

  it("steht nur an den beiden Arbeitstabellen Programm und Regie", () => {
    assert.deepEqual(DICHT, ["components/programme/ProgrammeTable.tsx", "components/regie/RegieTable.tsx"]);
  });

  it("dort stehen Felder in der Zeile, die Zeile bleibt trotzdem bei 44", () => {
    for (const f of DICHT) {
      const text = lies(f);
      assert.match(text, /<Input\b/, `${f}: Felder in der Zeile`);
      assert.doesNotMatch(text, /<Tr\b[^>]*\bcontrols\b/, `${f}: dicht und controls widersprechen sich`);
    }
  });

  it("`dicht` schaltet nur die Erkennung ab, es setzt selbst keine Höhe", () => {
    assert.doesNotMatch(TABLE, /dicht && "/);
  });
});
