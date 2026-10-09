import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { fetteUeberschrift, fetteUeberschriften } from "@/components/wiki/markdown-parse";
import { migrationText } from "@/tests/migration-datei";

/**
 * PART-104, zweiter Teil (Konrad 08.10.2026, K-73; Plan 09.10.): die Gliederung im Text. Die Unterabschnitte der Artikel standen als
 * **fette Zeilen** — sie sahen aus wie Betonung, nicht wie Überschrift, und die Seite konnte sie nicht gliedern. Jetzt sind es `###`.
 * Die Regel steht an drei Stellen und wird hier gleichgehalten: in `fetteUeberschrift` (Editor, Wächter), in der Hilfsfunktion der
 * Migration (Datenbank; ihr SQL-Test belegt dieselben Fälle) und in den Quelldateien `content/wiki/*.md`.
 */

const ordner = "content/wiki";
const dateien = readdirSync(ordner).filter((d) => d.endsWith(".md")).sort();
const lies = (pfad: string) => readFileSync(pfad, "utf8");
const wb = (sprache: "de" | "en") => JSON.parse(lies(`lib/i18n/${sprache}.json`)).wiki as Record<string, string>;

describe("PART-104: Wiki — die Regel für fette Überschriften (dieselben Fälle wie im SQL-Test)", () => {
  /** [Zeile, die Überschrift oder null] — die SQL-Fälle 01a–01zb als Text der Überschrift. */
  const FAELLE: [string, string | null][] = [
    ["**Schritt 1: Code eingeben und Ticket einlösen**", "Schritt 1: Code eingeben und Ticket einlösen"],
    ["**Adresse:**", "Adresse"],
    ["**Adresse**:", "Adresse"],
    ["**Adresse :**  ", "Adresse"],
    ["**Ihr kommt mit Transporter oder LKW?**", "Ihr kommt mit Transporter oder LKW?"],
    ["**Beispiel 3: Next-Level Productivity (Teil 2)**", "Beispiel 3: Next-Level Productivity (Teil 2)"],
    ["**A) Offizielle Getränkepartner**", "A) Offizielle Getränkepartner"],
    ["**Größe & Maße für Druckdaten – Beschnitt**", "Größe & Maße für Druckdaten – Beschnitt"],
    ["**Wichtig: Ohne Chip kein Pfand zurück.**", null],
    ["**Achtung!**", null],
    ["**Wichtig.**:", null],
    ["**   **", null],
    ["**:**", null],
    ["****", null],
    ["Das ist **wichtig** hier", null],
    ["**a** und **b**", null],
    ["**a*b**", null],
    ["- **Fett** in der Liste", null],
    ["* **Fett**", null],
    ["> **Hinweis**", null],
    ["## **Titel**", null],
    ["| **a** | b |", null],
    ["  **Fett**", null],
    ["*Kursiv*", null],
    ["", null],
  ];

  for (const [zeile, soll] of FAELLE) {
    it(`${JSON.stringify(zeile)} → ${soll === null ? "bleibt" : `### ${soll}`}`, () => {
      assert.equal(fetteUeberschrift(zeile), soll);
    });
  }

  it("Zeile für Zeile, mit Zeilennummer ab 1 — auch mit Wagenrücklauf", () => {
    assert.deepEqual(fetteUeberschriften("Einleitung\n\n**A**\nText\n\n**B**:\n"), [
      { zeile: 3, text: "A" },
      { zeile: 6, text: "B" },
    ]);
    assert.deepEqual(fetteUeberschriften("**A**\r\nText\r\n"), [{ zeile: 1, text: "A" }]);
    assert.deepEqual(fetteUeberschriften(""), []);
  });

  it("die Migration schreibt dieselbe Regel: Muster, Doppelpunkt am Ende, Punkt und Ausrufezeichen, ohne Audit, `updated_at` bleibt", () => {
    const sql = migrationText("v6_wiki_zwischenueberschriften");
    assert.match(sql, /regexp_match\(z\.zeile, '\^\\\*\\\*\(\[\^\*\]\+\)\\\*\\\*:\?\[ \\t\\r\]\*\$'\)/);
    assert.match(sql, /regexp_replace\(btrim\(m\.t\[1\]\), ':\+\$', ''\)/);
    assert.match(sql, /u\.text !~ '\[\.!\]\$'/);
    assert.match(sql, /'### ' \|\| u\.text/);
    assert.doesNotMatch(sql, /log_audit/);
    assert.match(sql, /a\.updated_at is distinct from v\.updated_at/);
  });

  it("die Migration folgt der Konvention: Kopf, `search_path`, Hilfsfunktion nur für den Server, `harden_definer_functions` zuletzt", () => {
    const sql = migrationText("v6_wiki_zwischenueberschriften");
    assert.match(sql, /^-- 00NN · Wiki: fette Zeilen werden Zwischenüberschriften/);
    assert.match(sql, /\nset search_path = public, extensions;\n/);
    assert.match(sql, /revoke execute on function wiki_fette_zeilen_zu_ueberschriften\(text\) from public, anon, authenticated;/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
    // Idempotent und lückenlos: nur Zeilen ändern, die sich ändern, und die Zahl gegenprüfen.
    assert.match(sql, /where body_md is distinct from wiki_fette_zeilen_zu_ueberschriften\(body_md\)/);
    assert.match(sql, /if v_geaendert <> v_artikel then/);
  });
});

describe("PART-104: Wiki — der Wächter über content/wiki/*.md", () => {
  it("es gibt die 26 Quelldateien", () => {
    assert.equal(dateien.length, 26);
  });

  it("keine fette Zeile steht mehr als Überschrift da — mit `###` markieren (ein fetter Satz mit Punkt ist ein Hinweis und darf bleiben)", () => {
    const funde = dateien.flatMap((d) => fetteUeberschriften(lies(`${ordner}/${d}`)).map((f) => `${d}:${f.zeile} ${f.text}`));
    assert.deepEqual(funde, []);
  });

  it("keine Ebene wird übersprungen und keine geht tiefer als `###`: nach `##` kommt höchstens `###`; ein `#` gibt es im Text nicht (der Titel ist der `h1`)", () => {
    const fehler: string[] = [];
    for (const d of dateien) {
      let davor = 1; // der Titel des Artikels
      lies(`${ordner}/${d}`)
        .replace(/\r\n/g, "\n")
        .split("\n")
        .forEach((zeile, i) => {
          const m = /^(#{1,6})\s+\S/.exec(zeile);
          if (!m) return;
          const stufe = m[1].length;
          if (stufe === 1) fehler.push(`${d}:${i + 1} „#“ im Text — der Titel ist der h1`);
          else if (stufe > 3) fehler.push(`${d}:${i + 1} tiefer als ###`);
          else if (stufe > davor + 1) fehler.push(`${d}:${i + 1} Ebene übersprungen (${davor} → ${stufe})`);
          davor = stufe;
        });
    }
    assert.deepEqual(fehler, []);
  });

  it("die Umstellung hat nur die Markierung geändert: der Wortlaut steht, Doppelpunkte im Text auch; der fette Hinweis im Pfand bleibt fett", () => {
    const tickets = lies(`${ordner}/tickets-akkreditierung.md`);
    assert.match(tickets, /^### Schritt 1: Code eingeben und Ticket einlösen$/m);
    assert.match(tickets, /^### Schritt 2: Personalisierung der Tickets$/m);
    assert.match(lies(`${ordner}/location-anfahrt.md`), /^### Adresse$/m);
    assert.match(lies(`${ordner}/anlieferung-aufbau.md`), /^### PKW \(Kleinmengen\)$/m);
    assert.match(lies(`${ordner}/pfand.md`), /^\*\*Wichtig: Ohne Chip kein Pfand zurück\.\*\*$/m);
    const anzahl = dateien.reduce((n, d) => n + (lies(`${ordner}/${d}`).match(/^### /gm) ?? []).length, 0);
    assert.ok(anzahl >= 25, `mindestens die 25 umgestellten Zeilen, gezählt ${anzahl}`);
  });
});

describe("PART-104: Wiki — der Hinweis im Editor und die Regel für Überschriften", () => {
  const editor = lies("components/wiki/Editor.tsx");

  it("der Editor weist auf eine fette Zeile hin, die eine Überschrift sein sollte: die erste mit Zeilennummer, dazu die Zahl der weiteren", () => {
    assert.match(editor, /import \{ fetteUeberschriften \} from "\.\/markdown-parse";/);
    assert.match(editor, /const fette = useMemo\(\(\) => fetteUeberschriften\(value\), \[value\]\);/);
    assert.match(editor, /\{fette\.length > 0 && \(\s*<p className="ct-small text-warning-ink">/);
    assert.match(editor, /t\.boldHeadingHint\.replace\("\{text\}", fette\[0\]\.text\)\.replace\("\{zeile\}", String\(fette\[0\]\.zeile\)\)/);
    assert.match(editor, /fette\.length > 1 && ` \$\{t\.boldHeadingMore\.replace\("\{n\}", String\(fette\.length - 1\)\)\}`/);
  });

  it("die Texte stehen in DE und EN, mit ihren Platzhaltern; die Hilfe nennt die Regel (## und ###, Frage oder Substantiv, ohne Doppelpunkt)", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = wb(sprache);
      assert.match(w.boldHeadingHint, /###/, sprache);
      assert.match(w.boldHeadingHint, /\{text\}/, sprache);
      assert.match(w.boldHeadingHint, /\{zeile\}/, sprache);
      assert.match(w.boldHeadingMore, /\{n\}/, sprache);
      assert.match(w.editorHint, /## .*### /, sprache);
    }
    assert.match(wb("de").editorHint, /Doppelpunkt/);
    assert.match(wb("de").editorHint, /Frage/);
    assert.match(wb("en").editorHint, /colon/);
    assert.match(wb("en").editorHint, /question/);
  });

  it("der Import liest weiter die Quelldateien und wandelt nichts um — sie sind die Wahrheit, die Datenbank ist ihr Spiegel", () => {
    const importer = lies("scripts/wiki-import.mjs");
    assert.match(importer, /leseQuellen\(ordner\)/);
    assert.doesNotMatch(importer, /\\\*\\\*/);
  });
});
