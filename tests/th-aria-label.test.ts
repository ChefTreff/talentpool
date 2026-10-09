import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * QS-077 (Befund aus #416): `Th` kannte kein `aria-label` und verwarf es still. Achtzehn Stellen setzen
 * `<Th aria-label={t.colAction} />` für die Spalte mit den Aktionen — im HTML stand eine leere Kopfzelle, und Vorlesesoftware
 * las „leer“. Es gibt keinen DOM-Testlauf im Repo: der Baustein wird als Quelltext geprüft, die Stellen durch Suchen.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");

function tsxDateien(ordner: string, funde: string[] = []): string[] {
  for (const e of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = `${ordner}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next") tsxDateien(pfad, funde);
    } else if (/\.tsx$/.test(e.name)) {
      funde.push(pfad);
    }
  }
  return funde;
}

const alle = [...tsxDateien("app"), ...tsxDateien("components")];
const tabelle = lies("components/ui/Table.tsx");
const th = tabelle.slice(tabelle.indexOf("export function Th("), tabelle.indexOf("export function Tbody("));

describe("QS-077: Th gibt aria-label weiter", () => {
  it("der Name ist eine Eigenschaft von `Th` und steht an der Kopfzelle", () => {
    assert.ok(th.length > 200, "Th gefunden");
    assert.match(th, /"aria-label": ariaLabel,/);
    assert.match(th, /"aria-label"\?: string;/);
    assert.match(th, /<th\s+scope="col"\s+aria-sort=\{sort\}\s+aria-label=\{ariaLabel\}/);
  });

  it("jede Stelle mit `<Th aria-label=` benutzt den Baustein aus dem Kit — nicht einen eigenen mit demselben Namen", () => {
    // Der Baustein selbst nennt das Beispiel in seinem Kommentar und zählt nicht mit.
    const stellen = alle.filter((d) => d !== "components/ui/Table.tsx" && /<Th\b[^>]*\baria-label=/.test(lies(d)));
    assert.ok(stellen.length > 0, "die Suche findet Stellen");
    const fremd = stellen.filter(
      (d) => !/import \{[^}]*\bTh\b[^}]*\} from "[^"]*(components\/ui\/Table|\.\/Table)"/.test(lies(d)),
    );
    assert.deepEqual(fremd, []);
  });
});

describe("QS-077: Spaltenköpfe ohne Namen", () => {
  /** Köpfe ohne Text und ohne `aria-label` — heute fünf, alle im Admin; die Liste wächst nicht. */
  const BEKANNT: Record<string, number> = {
    "app/(admin)/admin/edition/GeruestView.tsx": 4,
    "app/(admin)/admin/speaker-leads/LeadsView.tsx": 1,
  };

  it("`<Th />` steht nur noch an den bekannten Stellen: eine neue Spalte ohne Überschrift bekommt `aria-label`", () => {
    const gefunden: Record<string, number> = {};
    for (const d of alle) {
      const n = (lies(d).match(/<Th\s*\/>|<Th><\/Th>/g) ?? []).length;
      if (n > 0) gefunden[d] = n;
    }
    assert.deepEqual(gefunden, BEKANNT);
  });
});
