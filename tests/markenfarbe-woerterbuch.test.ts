import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-060: Kontrollkästchen und Optionsfelder malte der Browser in seiner
 * Systemfarbe (Chrome: Blau). Es sind 66 im Portal, und nur eines setzte die
 * Markenfarbe von Hand — eine Basisregel in `globals.css` löst alle.
 *
 * QS-061: Vier Wörterbuchtexte trugen Markdown (`**und**`, Backticks), und
 * die Oberfläche setzt sie als reinen Text: Die Sterne standen wörtlich da.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");

describe("Kontrollkästchen und Optionsfelder in Markenfarbe (QS-060)", () => {
  const css = lies("app/globals.css");
  const basis = /@layer base \{([\s\S]*?)\n\}\n/.exec(css)?.[1] ?? "";

  it("trägt die Regel in `@layer base`, damit Utilities weiter gewinnen", () => {
    assert.ok(basis.length > 0, "@layer base gefunden");
    assert.match(basis, /input\[type="checkbox"\],\s*input\[type="radio"\]\s*\{\s*accent-color: var\(--ct-accent-strong\);\s*\}/);
  });

  it("nimmt `accent-strong`: das weiße Häkchen trägt dort 4,85:1", () => {
    // Die Akzentfläche selbst (`accent`) erreicht mit Weiß 4,88:1; `accent-strong` ist der Text- und Knopfton.
    assert.match(css, /--ct-accent-strong:\s*#5b5bd9;/i);
  });
});

describe("Wörterbuchtexte ohne Markdown (QS-061)", () => {
  /** Alle Zeichenketten eines Wörterbuchs mit ihrem Pfad. */
  function texte(wert: unknown, pfad = ""): [string, string][] {
    if (typeof wert === "string") return [[pfad, wert]];
    if (Array.isArray(wert)) return wert.flatMap((v, i) => texte(v, `${pfad}[${i}]`));
    if (wert && typeof wert === "object")
      return Object.entries(wert).flatMap(([k, v]) => texte(v, pfad ? `${pfad}.${k}` : k));
    return [];
  }

  for (const sprache of ["de", "en"]) {
    it(`${sprache}: kein Text trägt \`**\` oder Backticks`, () => {
      const verstoesse = texte(JSON.parse(lies(`lib/i18n/${sprache}.json`)))
        .filter(([, text]) => /\*\*|`/.test(text))
        .map(([pfad, text]) => `${pfad}: ${text.slice(0, 80)}`);
      assert.deepEqual(verstoesse, []);
    });
  }
});
