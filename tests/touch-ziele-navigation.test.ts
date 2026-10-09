import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-059: Nachtrag zu QS-057. Die Kit-Knöpfe halten auf groben Zeigern 44 px;
 * gemessen am Handy lagen aber noch die Navigationslinks der Seitenleiste (32),
 * die Reiter (32), das Logo (24–35), der Sprachschalter der Login-Seite (28 × 28),
 * „Anmelden“ (32), die Fußlinks (20) und roh gesetzte Aufklappzeilen (20) darunter.
 * Außerdem wechselten Medien und Dubletten ihre Bereiche mit einer Knopfreihe statt
 * mit den Reitern, die überall sonst im Admin stehen.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const ANZAHL = (text: string, muster: RegExp) => (text.match(muster) ?? []).length;
const COARSE = /pointer-coarse:min-h-11/g;

describe("Touch-Ziele in der Shell (QS-059)", () => {
  const ERWARTET: [string, number][] = [
    ["components/layout/SidebarNav.tsx", 3], // Punkt, Abschnittslink und Unterpunkt (ADM-081)
    ["components/layout/SidebarShell.tsx", 1], // Logo
    ["components/layout/AppHeader.tsx", 3], // Logo, Abmelden, Anmelden
    ["components/layout/LocaleSwitcher.tsx", 1],
    ["components/layout/PortalFooter.tsx", 2], // beide Fassungen (hell und Navy)
  ];
  for (const [datei, n] of ERWARTET) {
    it(`${datei}: ${n}× Untergrenze 44 px auf groben Zeigern`, () => {
      assert.equal(ANZAHL(lies(datei), COARSE), n);
    });
  }

  it("der Sprachschalter bekommt auch Breite, nicht nur Höhe (28 × 28 → 44 × 44)", () => {
    assert.match(lies("components/layout/LocaleSwitcher.tsx"), /pointer-coarse:min-w-11/);
  });

  it("die Reiter bauen auf `ChipLink` auf, der die 44 px selbst hält (QS-064)", () => {
    const reiter = lies("components/layout/SectionTabs.tsx");
    assert.match(reiter, /<ChipLink key=\{item\.href\} href=\{item\.href\} aktiv=\{active\}>/);
    assert.match(lies("components/ui/Chip.tsx"), /const grundform = "[^"]*pointer-coarse:min-h-11"/);
  });

  it("Desktop bleibt: die bisherigen Abstände stehen unverändert da", () => {
    assert.match(lies("components/ui/Chip.tsx"), /px-2\.5 py-1\.5 ct-label/);
    assert.match(lies("components/layout/SidebarNav.tsx"), /py-1\.5 pr-2\.5 ct-label/);
  });

  it("jede rohe `<summary>` hat eine Trefferfläche von 44 px", () => {
    const verstoesse: string[] = [];
    const suche = (ordner: string) => {
      for (const e of readdirSync(ordner, { withFileTypes: true })) {
        const pfad = `${ordner}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name !== "node_modules" && e.name !== ".next") suche(pfad);
        } else if (/\.tsx$/.test(e.name)) {
          lies(pfad).split("\n").forEach((zeile, i) => {
            // Kommentare nennen das Element nur (`<details>/<summary>`), sie setzen keins.
            if (/^\s*(\/\/|\*|\/\*)/.test(zeile)) return;
            if (/<summary\b/.test(zeile) && !/min-h-11|pointer-coarse:/.test(zeile)) verstoesse.push(`${pfad}:${i + 1}`);
          });
        }
      }
    };
    suche("app");
    suche("components");
    assert.deepEqual(verstoesse, []);
  });
});

describe("Reiter statt Knopfreihe (QS-059)", () => {
  it("SectionTabs kennt `aktiv` für Reiter, die über die Adresszeile wechseln", () => {
    const q = lies("components/layout/SectionTabs.tsx");
    assert.match(q, /aktiv\?: boolean/);
    assert.match(q, /item\.aktiv !== undefined \? item\.aktiv : item\.exact/);
  });

  for (const [datei, aktiv] of [
    ["app/(admin)/admin/medien/page.tsx", "aktiv: b === bereich"],
    ["app/(admin)/admin/personen/dubletten/page.tsx", "aktiv: s === status"],
  ] as const) {
    it(`${datei}: Reiter mit ${aktiv}, keine Knopfreihe`, () => {
      const q = lies(datei);
      assert.match(q, /<SectionTabs\b/);
      assert.ok(q.includes(aktiv));
      assert.doesNotMatch(q, /variant=\{[^}]*"secondary" : "ghost"\}/);
    });
  }
});
