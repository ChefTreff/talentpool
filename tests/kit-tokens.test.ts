import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { compile } from "tailwindcss";

/**
 * QS-065 (10): rohe Maße in Kit-Bausteinen (Modal 560, Drawer 520, Porträt 168, Hero-Band-Formen, Lesezeilen
 * in Zeichen) ohne Token. Jetzt: die Breiten als `--ct-w-*` mit `--container-*` (wie `max-w-content`), Formen auf
 * der Abstandsskala. Ein Test hält fest, dass kein Baustein und keine Seite wieder ein rohes Maß in eckige
 * Klammern setzt (Skill-Regel 2).
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const CSS = lies("app/globals.css");

function quellen(ordner: string, treffer: string[] = []): string[] {
  for (const e of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = `${ordner}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next" && !e.name.startsWith("vorschau-")) quellen(pfad, treffer);
    } else if (/\.tsx$/.test(e.name)) treffer.push(pfad);
  }
  return treffer;
}

const TOKENS: [string, string][] = [
  ["dialog", "560px"],
  ["drawer", "520px"],
  ["lead", "46ch"],
  ["meldung", "52ch"],
];

describe("Breiten-Tokens (QS-065 (10))", () => {
  for (const [name, wert] of TOKENS) {
    it(`--ct-w-${name}: ${wert} in \`:root\`, \`--container-${name}\` im Theme`, () => {
      assert.match(CSS, new RegExp(`--ct-w-${name}: ${wert};`));
      assert.match(CSS, new RegExp(`--container-${name}: var\\(--ct-w-${name}\\);`));
    });
  }

  it("Tailwind macht daraus Klassen (sonst fiele ein Tippfehler im Namen stillschweigend weg)", async () => {
    const theme = /@theme inline \{[\s\S]*?\n\}/.exec(CSS)?.[0] ?? "";
    assert.ok(theme.length > 0, "Theme-Block gefunden");
    const tw = await compile(`@theme { --spacing: 0.25rem; }\n${theme}\n@tailwind utilities;`);
    const css = tw.build(["max-w-dialog", "max-w-drawer", "max-w-lead", "max-w-meldung", "h-42", "w-45", "h-65", "w-30", "w-52", "max-w-105", "min-w-36", "min-w-48", "min-w-56", "min-w-64"]);
    for (const [name] of TOKENS) assert.match(css, new RegExp(`max-width: var\\(--ct-w-${name}\\)`), `max-w-${name}`);
    assert.match(css, /height: calc\(var\(--spacing\) \* 42\)/); // Porträt groß: 168 px
    assert.match(css, /width: calc\(var\(--spacing\) \* 45\)/); // Hero-Band-Linienzug: 180 px
    assert.match(css, /height: calc\(var\(--spacing\) \* 65\)/); // Hero-Band-Fläche: 260 px
    assert.match(css, /width: calc\(var\(--spacing\) \* 30\)/); // Datumsspalte: 7,5 rem
    assert.match(css, /width: calc\(var\(--spacing\) \* 52\)/); // Portalwechsel: 13 rem
    assert.match(css, /max-width: calc\(var\(--spacing\) \* 105\)/); // kleiner Dialog im Board: 420 px
    for (const n of [36, 48, 56, 64]) assert.match(css, new RegExp(`min-width: calc\\(var\\(--spacing\\) \\* ${n}\\)`)); // Felder in Programm und Regie: 9, 12, 14, 16 rem
  });

  it("die Anmeldeseite nutzt dieselben Zeilenlängen wie der Leerzustand", () => {
    assert.match(lies("app/login/LoginForm.tsx"), /max-w-lead/);
    assert.match(lies("app/login/LoginForm.tsx"), /max-w-meldung/);
  });

  it("die Bausteine nehmen die Tokens", () => {
    assert.match(lies("components/ui/Modal.tsx"), /"max-w-dialog"/);
    assert.match(lies("components/ui/Drawer.tsx"), /max-w-drawer/);
    assert.match(lies("components/ui/EmptyState.tsx"), /max-w-lead/);
    assert.match(lies("components/ui/HeroBand.tsx"), /max-w-lead/);
    assert.match(lies("components/ui/ErrorState.tsx"), /max-w-meldung/);
    assert.match(lies("components/ui/PortraitShape.tsx"), /gross \? "h-42 w-42" : "h-14 w-14"/);
  });
});

describe("Kein rohes Maß in eckigen Klammern (QS-065 (10), Skill-Regel 2)", () => {
  const ALLE = quellen("app").concat(quellen("components"));

  it("keine Pixelwerte in `[…px]`", () => {
    const funde = ALLE.flatMap((f) =>
      lies(f).split("\n").flatMap((z, i) => (/\[[0-9.]+px\]/.test(z) ? [`${f}:${i + 1}`] : [])),
    );
    assert.deepEqual(funde, []);
  });

  it("keine festen Breiten oder Höhen in `rem` oder `ch` als eckige Klammer (`w-[13rem]`, `max-w-[46ch]`)", () => {
    const funde = ALLE.flatMap((f) =>
      lies(f).split("\n").flatMap((z, i) => (/(?:^|[\s"'`:])(?:min-|max-)?(?:w|h|size)-\[[0-9.]+(?:rem|ch)\]/.test(z) ? [`${f}:${i + 1}`] : [])),
    );
    assert.deepEqual(funde, []);
  });

  it("die Prüfung erfasst, was sie soll (Gegenprobe an Beispielzeilen)", () => {
    assert.match('className="max-w-[560px]"', /\[[0-9.]+px\]/);
    assert.match(' w-[13rem] ', /(?:^|[\s"'`:])(?:min-|max-)?(?:w|h|size)-\[[0-9.]+(?:rem|ch)\]/);
    assert.match('"max-w-[46ch]"', /(?:^|[\s"'`:])(?:min-|max-)?(?:w|h|size)-\[[0-9.]+(?:rem|ch)\]/);
    assert.doesNotMatch('sm:grid-cols-[minmax(0,14rem)_1fr]', /(?:^|[\s"'`:])(?:min-|max-)?(?:w|h|size)-\[[0-9.]+(?:rem|ch)\]/);
  });
});
