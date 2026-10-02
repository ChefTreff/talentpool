import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { testbetriebAktiv } from "@/lib/testbetrieb";

/**
 * QS-056 (c): Der Hinweis „Testbetrieb — Daten mit ZZTEST sind Testdaten“
 * steht einmal in der Shell und lässt sich über eine Umgebungsvariable
 * abschalten. Der Test hält fest, was daran nicht kaputtgehen darf:
 * der Schalter (Vorgabe an, aus nur mit `false`), der Einbau an genau einer
 * Stelle und der Wortlaut in beiden Sprachen.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");

describe("Schalter des Testbetrieb-Hinweises", () => {
  it("ist ohne Wert an — Vorgabe", () => {
    assert.equal(testbetriebAktiv(undefined), true);
    assert.equal(testbetriebAktiv(""), true);
  });

  it("geht nur mit `false` aus", () => {
    assert.equal(testbetriebAktiv("false"), false);
    // Ein Wert, der mit Zeilenumbruch oder Leerzeichen gesetzt wurde, soll den
    // Hinweis am Go-live nicht stehen lassen.
    assert.equal(testbetriebAktiv("false\n"), false);
    assert.equal(testbetriebAktiv(" false "), false);
  });

  it("lässt jeden anderen Wert stehen — auch Tippfehler und andere Schreibweisen von „aus“", () => {
    for (const w of ["true", "1", "0", "off", "aus", "no", "nein", "False", "FALSE", "fals"]) {
      assert.equal(testbetriebAktiv(w), true, w);
    }
  });

  it("liest die Variable wörtlich, damit Next sie beim Build einsetzt", () => {
    // Ein berechneter Name (`process.env[name]`) wird nicht ersetzt — der
    // Schalter wäre im ausgelieferten Code dann dauerhaft „nicht gesetzt“.
    const quelle = lies("lib/testbetrieb.ts");
    assert.match(quelle, /process\.env\.NEXT_PUBLIC_TESTBETRIEB_HINWEIS/);
    assert.doesNotMatch(quelle, /process\.env\[/);
  });
});

describe("Einbau in die Shell", () => {
  const shell = lies("components/layout/SidebarShell.tsx");

  it("sitzt in SidebarShell: nach der Kopfzeile, vor dem Inhalt, hinter dem Schalter", () => {
    const kopfEnde = shell.indexOf("</header>");
    const hinweis = shell.indexOf("<TestbetriebHinweis");
    const inhalt = shell.indexOf("<main");
    assert.ok(kopfEnde > 0 && hinweis > kopfEnde, "Hinweis steht unter der Kopfzeile");
    assert.ok(inhalt > hinweis, "und über dem Inhalt");
    assert.match(shell, /testbetriebAktiv\(\)\s*&&\s*\(\s*<TestbetriebHinweis/);
  });

  it("folgt der Inhaltsbreite der Shell, damit der Text mit dem Seitentitel fluchtet", () => {
    assert.match(shell, /<TestbetriebHinweis[^>]*breite=\{width\}/);
  });

  it("steht nirgends sonst — weder in Layouts noch in Seiten", () => {
    // Zweimal eingebaut hieße zwei Streifen untereinander; und ein Bereich
    // mit eigenem Einbau liefe an der zentralen Abschaltung vorbei.
    const treffer: string[] = [];
    const suche = (ordner: string) => {
      for (const e of readdirSync(ordner, { withFileTypes: true })) {
        const pfad = `${ordner}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name !== "node_modules" && e.name !== ".next") suche(pfad);
        } else if (/\.tsx?$/.test(e.name) && /<TestbetriebHinweis\b/.test(lies(pfad))) {
          treffer.push(pfad);
        }
      }
    };
    suche("app");
    suche("components");
    treffer.sort();
    assert.deepEqual(treffer, [
      "components/layout/SidebarShell.tsx",
      // Die Kit-Galerie zeigt den Baustein; sie ist keine Seite mit Daten.
      "components/ui/KitSchau.tsx",
    ]);
  });
});

describe("Baustein", () => {
  const baustein = lies("components/ui/TestbetriebHinweis.tsx");

  it("ist ein Hinweis (role=note) in Warnfarbe aus den Tokens — keine rohen Werte", () => {
    assert.match(baustein, /role="note"/);
    assert.match(baustein, /bg-warning-soft/);
    assert.match(baustein, /text-warning-ink/);
    assert.doesNotMatch(baustein, /#[0-9a-fA-F]{6}\b/);
    assert.doesNotMatch(baustein, /\[[0-9]+px\]/);
  });

  it("zeigt am Handy nur den Kernsatz und den zweiten Satz erst ab md", () => {
    assert.match(baustein, /hidden md:inline/);
    // Nicht wegklickbar und kein Overlay: nichts Interaktives, nichts Festes.
    assert.doesNotMatch(baustein, /\b(fixed|sticky|absolute)\b/);
    assert.doesNotMatch(baustein, /<button|onClick|useState/);
  });
});

describe("Wortlaut", () => {
  for (const sprache of ["de", "en"] as const) {
    const t = JSON.parse(lies(`lib/i18n/${sprache}.json`)).testbetrieb as Record<string, string>;

    it(`${sprache}: Beschriftung, Kernsatz und Regel sind da`, () => {
      assert.deepEqual(Object.keys(t).sort(), ["kurz", "label", "mehr"]);
      for (const k of ["kurz", "label", "mehr"]) assert.ok(t[k].trim().length > 0, k);
    });

    it(`${sprache}: der Kernsatz nennt die Kennung ZZTEST`, () => {
      // Das ist die Information. Ginge sie in einer Übersetzung verloren,
      // wüsste das Team nicht, woran es Testdaten erkennt.
      assert.match(t.kurz, /ZZTEST/);
    });

    it(`${sprache}: der Kernsatz bleibt kurz genug für eine Zeile am Handy`, () => {
      // 13 px, 343 px Breite abzüglich Beschriftung: gut 40 Zeichen passen.
      assert.ok(t.kurz.length <= 40, `${t.kurz.length} Zeichen`);
    });
  }
});
