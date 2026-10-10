import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { mailtoLink } from "@/lib/tickets/nicht-personalisiert";

/**
 * TAL-020, B12-Rest (Plan 10.10.2026): auf `/admin/bewerbungen/tickets` ist die Käufer-Adresse ein `mailto:`-Link (die Liste ist „zum Nachfassen“ da), und beide
 * Tabellen werden unter 640 px zu Blöcken (`<Table stapeln>`) statt seitlich zu scrollen — „Stand“, die wichtigste Spalte, lag bei 375 px außerhalb des Bildes
 * (Tabelle 644 px in 341). Die Regel für den Link ist eine reine Funktion (`lib/tickets/nicht-personalisiert.ts`), der Rest wird am Quelltext geprüft.
 */
const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("TAL-020 B12: `mailtoLink` — nur für eine einfache Adresse", () => {
  it("eine gewöhnliche Adresse wird zum Link, mit Plus, Punkten und Bindestrich", () => {
    assert.equal(mailtoLink("anna.schneider@beispiel.de"), "mailto:anna.schneider@beispiel.de");
    assert.equal(mailtoLink("a+tag@sub.beispiel-firma.example"), "mailto:a+tag@sub.beispiel-firma.example");
    assert.equal(mailtoLink("  lea@example.com  "), "mailto:lea@example.com", "Leerraum außen wird abgeschnitten");
  });

  it("keine Abfrage und kein zweiter Empfänger: ein `?cc=…`, `&bcc=…` oder eine zweite Adresse würden das Mailprogramm der Person vorbelegen, die die Liste öffnet", () => {
    for (const x of ["a@b.de?cc=x@y.de", "a@b.de&bcc=x@y.de", "a@b.de,x@y.de", "a@b.de;x@y.de", "a@b.de#frag", "a%40b.de@c.de", "<a@b.de>", '"a"@b.de', "a'b@c.de"]) {
      assert.equal(mailtoLink(x), null, x);
    }
  });

  it("Leerraum in der Adresse, fehlendes @, fehlende Domain-Endung, Schema statt Adresse: Text statt Link", () => {
    for (const x of ["kaputt adresse@x.de", "ohne-at.de", "a@b", "a@@b.de", "@b.de", "a@.de", "javascript:alert(1)", "mailto:a@b.de", "a@b.de/pfad", "a@b.de\\x", "", "   "]) {
      assert.equal(mailtoLink(x), null, JSON.stringify(x));
    }
    assert.equal(mailtoLink(null), null);
    assert.equal(mailtoLink(undefined), null);
  });
});

describe("TAL-020 B12: die Admin-Seite (Quelltext)", () => {
  const seite = ohneKommentare(lies("app/(admin)/admin/bewerbungen/tickets/page.tsx"));
  const tabellen = seite.split("<Table").slice(1);

  it("beide Tabellen sind gestapelt — unter 640 px Blöcke statt seitlichem Scrollen", () => {
    assert.equal(tabellen.length, 2);
    for (const t of tabellen) assert.match(t, /^ stapeln>/);
  });

  it("jede Zelle außer der ersten trägt ihre Beschriftung (`label=`) — sonst stünde im Block eine Zahl ohne Wort", () => {
    for (const t of tabellen) {
      const reihen = [...t.matchAll(/<Tr\b[^>]*>([\s\S]*?)<\/Tr>/g)].map((m) => m[1]);
      assert.ok(reihen.length >= 1, "keine Zeile gefunden");
      for (const reihe of reihen) {
        const zellen = [...reihe.matchAll(/<Td\b([^>]*)>/g)].map((m) => m[1]);
        assert.ok(zellen.length >= 5, `zu wenige Zellen: ${zellen.length}`);
        assert.doesNotMatch(zellen[0], /label=/, "die erste Zelle ist der Name der Zeile und braucht kein Wort");
        for (const [i, z] of zellen.slice(1).entries()) assert.match(z, /label=\{a\.\w+\}/, `Zelle ${i + 2} ohne Beschriftung`);
      }
    }
  });

  it("die Käufer-Adresse ist ein `mailto:`-Link (`ct-link`), solange sie eine einfache Adresse ist, sonst Text", () => {
    assert.match(seite, /\{mailtoLink\(z\.buyer_email\) \? \(\s*<a href=\{mailtoLink\(z\.buyer_email\) \?\? undefined\} className="ct-link">\{z\.buyer_email\}<\/a>\s*\) : \(\s*\(z\.buyer_email \?\? t\.common\.none\)\s*\)\}/);
    assert.match(seite, /import \{ mailtoLink, summiere,/);
  });
});
