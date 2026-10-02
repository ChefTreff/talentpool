import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-066: Im Produktstamm und bei den Vorlagen öffnete „Bearbeiten“ den Editor als
 * Karte **hinter** der Tabelle. In einer Liste mit sechzig Zeilen sah man nichts: der
 * Editor stand zweitausend Pixel tiefer, der Fokus blieb am Knopf.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");

describe("useEditorImBild", () => {
  const hook = lies("components/ui/useEditorImBild.ts");

  it("springt nur, wenn der Mensch geöffnet hat — nicht bei jedem Tastendruck im Entwurf", () => {
    assert.match(hook, /if \(!geoeffnet\.current \|\| !entwurf\) return;\s*geoeffnet\.current = false;/);
    assert.match(hook, /return \(\) => \{\s*geoeffnet\.current = true;\s*\};/);
  });

  it("scrollt ohne Animation zum Editor und setzt den Fokus ohne zweiten Sprung", () => {
    assert.match(hook, /scrollIntoView\(\{ block: "start" \}\)/);
    assert.doesNotMatch(hook, /behavior:\s*"smooth"/);
    assert.match(hook, /focus\(\{ preventScroll: true \}\)/);
  });

  it("findet den Editor über seine id, ohne einen Wrapper, der Zeilen neu einrückt", () => {
    assert.match(hook, /document\.getElementById\(id\)/);
  });

  it("ist im Kit-Index", () => {
    assert.match(lies("components/ui/index.ts"), /export \{ useEditorImBild \} from "\.\/useEditorImBild";/);
  });
});

describe("Editoren hinter einer Liste", () => {
  for (const [datei, id, oeffnungen] of [
    ["app/(admin)/admin/partner/produkte/ProductEditor.tsx", "produkt-editor", 2],
    ["app/(admin)/admin/partner/vorlagen/TemplateEditor.tsx", "vorlagen-editor", 2],
  ] as const) {
    it(`${datei}: ruft den Hook mit "${id}" und merkt sich jedes Öffnen (${oeffnungen}×)`, () => {
      const q = lies(datei);
      assert.ok(q.includes(`useEditorImBild(draft, "${id}")`));
      assert.ok(q.includes(`<Card id="${id}">`));
      // Jedes Öffnen von außen (Neu, Bearbeiten) ruft vorher `aufmachen()`; Abbrechen/Speichern setzt `null`.
      const aufrufe = (q.match(/aufmachen\(\);\s*setDraft\(\{/g) ?? []).length;
      assert.equal(aufrufe, oeffnungen);
      const oeffnet = (q.match(/setDraft\(\{ \.\.\./g) ?? []).length;
      assert.equal(oeffnet, oeffnungen, "jedes Öffnen geht über aufmachen()");
    });
  }

  it("Wächter: jede Datei, die einen Editor als Karte unter einer Liste aufklappt, nutzt den Hook", () => {
    const verstoesse: string[] = [];
    const suche = (ordner: string) => {
      for (const e of readdirSync(ordner, { withFileTypes: true })) {
        const pfad = `${ordner}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name !== "node_modules" && e.name !== ".next") suche(pfad);
        } else if (/\.tsx$/.test(e.name)) {
          const q = lies(pfad);
          if (/\{draft && \(\s*<Card\b/.test(q) && !q.includes("useEditorImBild")) verstoesse.push(pfad);
        }
      }
    };
    suche("app");
    suche("components");
    assert.deepEqual(verstoesse, []);
  });
});
