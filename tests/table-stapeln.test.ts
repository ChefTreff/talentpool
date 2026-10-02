import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-058: `Table` scrollt im eigenen Kasten, aber wo die Aktionen in der letzten
 * Spalte stehen, lagen sie am Handy außerhalb des Bildes (Kontakte 730 px breit,
 * Gästeliste 979 px bei 375 px). `<Table stapeln>` macht unter 640 px Blöcke aus den
 * Zeilen: Beschriftung je Zelle (`<Td label>`), Kopfzeile nur für Vorlesegeräte.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");

describe("Table stapeln (QS-058)", () => {
  const tabelle = lies("components/ui/Table.tsx");
  const css = lies("app/globals.css");

  it("Table setzt die Klasse nur auf Wunsch; Td trägt die Beschriftung als data-label", () => {
    assert.match(tabelle, /stapeln = false/);
    assert.match(tabelle, /stapeln && "ct-stapeln"/);
    assert.match(tabelle, /data-label=\{label\}/);
  });

  /** Der Text des obersten `@media`-Blocks, der `.ct-stapeln` enthält — Tiefe 0, also ohne `@layer`. */
  function stapelBlock(): string {
    let tiefe = 0;
    let start = -1;
    for (let i = 0; i < css.length; i++) {
      if (css[i] === "{") {
        if (tiefe === 0) start = css.lastIndexOf("\n", i) + 1;
        tiefe++;
      } else if (css[i] === "}") {
        tiefe--;
        if (tiefe === 0) {
          const block = css.slice(start, i + 1);
          if (block.startsWith("@media") && block.includes(".ct-stapeln")) return block;
        }
      }
    }
    return "";
  }

  it("die Regeln stehen auf oberster Ebene — ohne `@layer`, damit sie Zeilenhöhe und Polster der Zellen schlagen", () => {
    assert.ok(stapelBlock().length > 0, "Block mit .ct-stapeln gefunden");
  });

  it("gelten nur unter 640 px (Tailwinds sm minus 0,02) und lassen den Desktop in Ruhe", () => {
    const b = stapelBlock();
    assert.match(b, /^@media \(max-width: 639\.98px\)/);
  });

  it("machen Tabelle, Rumpf und Zeile zu Blöcken, die Kopfzeile unsichtbar (nur für Vorlesegeräte)", () => {
    const b = stapelBlock();
    assert.match(b, /\.ct-stapeln,\s*\.ct-stapeln tbody,\s*\.ct-stapeln tr\s*\{\s*display: block;/);
    assert.match(b, /\.ct-stapeln thead\s*\{[^}]*position: absolute;[^}]*clip-path: inset\(50%\);/);
  });

  it("setzen die Zeilenhöhe der Zelle zurück, blenden leere Zellen aus und zeigen die Beschriftung", () => {
    const b = stapelBlock();
    assert.match(b, /\.ct-stapeln td\s*\{[^}]*display: block;[^}]*height: auto;/);
    assert.match(b, /\.ct-stapeln td:empty\s*\{\s*display: none;/);
    assert.match(b, /td\[data-label\]::before\s*\{\s*content: attr\(data-label\);/);
  });

  it("die Beschriftung trägt die Rolle .ct-eyebrow — ohne ihre Werte zu kopieren", () => {
    assert.match(css, /\.ct-eyebrow,\s*\.ct-stapeln td\[data-label\]::before\s*\{/);
  });
});

describe("Tabellen, die stapeln", () => {
  const ERWARTET: [string, number][] = [
    ["components/partner/ContactList.tsx", 4], // E-Mail, Rollen, Zugang, Zusatzspalte
    ["components/partner/Gaesteliste.tsx", 2], // Rolle, Sessions
    ["app/(partner)/partner/dateien/FileList.tsx", 3], // Für, Status, Hochgeladen
    ["app/(partner)/partner/buehne/StandTabelle.tsx", 4], // Zeit, Titel DE, Titel EN, Status
  ];
  for (const [datei, labels] of ERWARTET) {
    it(`${datei}: <Table stapeln> und ${labels} Zellbeschriftungen`, () => {
      const q = lies(datei);
      assert.match(q, /<Table stapeln>/);
      assert.equal((q.match(/<Td label=/g) ?? []).length, labels);
    });
  }

  it("Wächter: jede Datei mit `<Table stapeln>` beschriftet ihre Zellen", () => {
    const ohne: string[] = [];
    const suche = (ordner: string) => {
      for (const e of readdirSync(ordner, { withFileTypes: true })) {
        const pfad = `${ordner}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name !== "node_modules" && e.name !== ".next") suche(pfad);
        } else if (/\.tsx$/.test(e.name)) {
          const q = lies(pfad);
          if (/<Table\b[^>]*\bstapeln\b/.test(q) && !/<Td\b[^>]*\blabel=/.test(q)) ohne.push(pfad);
        }
      }
    };
    suche("app");
    suche("components");
    assert.deepEqual(ohne, []);
  });
});
