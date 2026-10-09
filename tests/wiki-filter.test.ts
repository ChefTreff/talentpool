import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { gebuchteFormate } from "@/components/partner/wiki-formate";

/**
 * PART-103: Das Partner-Wiki zeigt allgemeine Artikel und die zu den gebuchten Leistungen. Die Datenbank-Seite (`kb_articles(p_formats)`,
 * Spalte `kb_article.product_formats`) belegt `supabase/tests/v6_wiki_thema_produktbezug.sql` (0271); hier steht, was das Portal daraus
 * macht: welche Formate eine Organisation gebucht hat, wo der Filter greift und wo nicht.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(quelle(`lib/i18n/${sprache}.json`)) as { wiki: Record<string, string> };

describe("PART-103: Formate der gebuchten Produkte", () => {
  it("jedes gebuchte Format steht einmal da, sortiert", () => {
    assert.deepEqual(
      gebuchteFormate([
        { format_key: "talk", status: "booked" },
        { format_key: "masterclass", status: "booked" },
        { format_key: "talk", status: "booked" },
        { format_key: "booth", status: "booked" },
      ]),
      ["booth", "masterclass", "talk"],
    );
  });

  it("eine stornierte Leistung öffnet nichts — dasselbe Format über ein zweites, gebuchtes Produkt schon", () => {
    assert.deepEqual(gebuchteFormate([{ format_key: "masterclass", status: "cancelled" }]), []);
    assert.deepEqual(
      gebuchteFormate([
        { format_key: "masterclass", status: "cancelled" },
        { format_key: "masterclass", status: "booked" },
      ]),
      ["masterclass"],
    );
  });

  it("ein Produkt ohne Format (Mobiliar, Technik) zählt nicht", () => {
    assert.deepEqual(gebuchteFormate([{ format_key: null, status: "booked" }]), []);
    assert.deepEqual(
      gebuchteFormate([
        { format_key: null, status: "booked" },
        { format_key: "branding", status: "booked" },
      ]),
      ["branding"],
    );
  });

  it("nichts gebucht oder keine Übersicht: eine leere Liste — „nur die allgemeinen Artikel“, nicht „alle“", () => {
    assert.deepEqual(gebuchteFormate([]), []);
    assert.deepEqual(gebuchteFormate(null), []);
    assert.deepEqual(gebuchteFormate(undefined), []);
  });

  it("die zweite TEST-Organisation (nur Branding) hat weder Masterclass noch Talk — die Artikel dazu fehlen ihr", () => {
    const formate = gebuchteFormate([{ format_key: "branding", status: "booked" }]);
    assert.deepEqual(formate, ["branding"]);
    assert.ok(!formate.includes("masterclass") && !formate.includes("talk"));
  });
});

describe("PART-103: wo der Filter greift (Quelltext-Prüfung — kein Render, JSX lädt der Testlader nicht)", () => {
  const seite = quelle("app/(partner)/partner/wiki/page.tsx");
  const wiki = quelle("components/wiki/WikiPage.tsx");
  const lader = quelle("components/wiki/load.ts");

  it("die Partner-Seite filtert nach den Produkten der gewählten Organisation", () => {
    assert.match(seite, /partner_overview", \{ p_org_id: current\.org_id, p_edition_id: current\.edition_id \}/);
    assert.match(seite, /formats = overview \? gebuchteFormate\(overview\.products\) : null;/);
    assert.match(seite, /<WikiPage audience="partner" locale="de" formats=\{formats\} \/>/);
  });

  it("ohne eigene Organisation (Team) und ohne Übersicht gibt es keinen Filter — kein Artikel wird durch einen Fehler versteckt", () => {
    assert.match(seite, /let formats: string\[\] \| null = null;\s+if \(current\) \{/);
    assert.ok(!/formats = [^;]*: \[\]/.test(seite), "ein Ladefehler darf keine leere Formatliste ergeben");
  });

  it("die Wiki-Seite reicht die Formate an den Lader, der Lader an die Datenbank", () => {
    assert.match(wiki, /loadArticles\(\{ audience, language: locale, editionId, role, formats \}\)/);
    assert.match(lader, /p_formats: input\.formats \?\? null,/);
  });

  it("der Satz zum Filter steht nur, wo gefiltert wird", () => {
    // Den Seitenkopf zeichnet seit PART-104 `WikiView`; der Satz geht als `lead` dorthin.
    assert.match(wiki, /lead=\{formats \? `\$\{t\.wiki\.lead\} \$\{t\.wiki\.partnerFilterNote\}` : t\.wiki\.lead\}/);
  });

  it("kein anderer Bereich übergibt Formate (sie sehen jeden Artikel ihrer Zielgruppe)", () => {
    const treffer: string[] = [];
    const suche = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const pfad = join(dir, name);
        if (statSync(pfad).isDirectory()) {
          if (name === "node_modules" || name === ".next") continue;
          suche(pfad);
        } else if (/\.tsx?$/.test(name) && /<WikiPage\b/.test(readFileSync(pfad, "utf8"))) {
          treffer.push(pfad);
        }
      }
    };
    suche("app");
    assert.ok(treffer.length >= 3, `zu wenige Wiki-Seiten gefunden (Partner, Speaker, Volunteers): ${treffer.join(", ")}`);
    const mitFormaten = treffer.filter((p) => /<WikiPage\b[^>]*formats=/.test(readFileSync(p, "utf8")));
    assert.deepEqual(mitFormaten, [join("app", "(partner)", "partner", "wiki", "page.tsx")]);
  });
});

describe("PART-103: der Satz auf der Wiki-Seite", () => {
  for (const sprache of ["de", "en"] as const) {
    it(`${sprache}: es gibt ihn und er sagt, was man sieht`, () => {
      const text = woerterbuch(sprache).wiki.partnerFilterNote;
      assert.equal(typeof text, "string");
      assert.match(text, sprache === "de" ? /allgemeinen Artikel.*gebuchten Leistungen/ : /general articles.*booked/);
      assert.match(text, sprache === "de" ? /Ansprechperson/ : /contact person/);
    });
  }
});

describe("PART-103: der Testdaten-Schritt `wiki` zeigt Konrad den Filter, ohne ein Ticket-Kontingent anzulegen", () => {
  const skript = quelle("scripts/testdaten-konrad.mjs");

  it("die zweite Organisation bucht genau ein Branding-Produkt und bricht ab, wenn es einen Pass-Typ trägt (vivenu-Coupon)", () => {
    assert.match(skript, /const WIKI_PRODUKT = "I-21634";/);
    assert.match(skript, /produkt\.format_key !== "branding"/);
    assert.match(skript, /if \(produkt\.pass_type\) \{\s+return fail\("Wiki-Filter"/);
  });

  it("sie sortiert hinter der ersten Test-Organisation (die bleibt Konrads Vorgabe) und wird mit `--remove` entfernt", () => {
    assert.match(skript, /const WIKI_ORG_NAME = `\$\{PREFIX\}Partner nur Branding`;/);
    assert.match(skript, /communication_name: `\$\{PREFIX\}Partner`,/);
    assert.match(skript, /wiki: wikiFilterSchritt,/);
    assert.match(skript, /Zweite TEST-Organisation \(Wiki-Filter\) entfernt/);
  });
});
