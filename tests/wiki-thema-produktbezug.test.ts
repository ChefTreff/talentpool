import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { SLUGS_JE_KATEGORIE, WIKI_KATEGORIEN } from "@/lib/wiki/kategorien";

const sql = migrationText("v6_wiki_thema_produktbezug");
const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = sql.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

describe("Wiki: Thema und Produktbezug am Artikel (ADM-064, PART-103)", () => {
  it("die Themen im Vokabular sind dieselben wie im Code, in derselben Reihenfolge", () => {
    const treffer = [...code.matchAll(/\('wiki_category', '([a-z]+)',\s+'[^']+',\s+'[^']+',\s+(\d+), true\)/g)];
    assert.deepEqual(treffer.map((m) => m[1]), [...WIKI_KATEGORIEN]);
    const sortierung = treffer.map((m) => Number(m[2]));
    assert.deepEqual(sortierung, [...sortierung].sort((a, b) => a - b));
  });

  it("die Bestandszuordnung der Migration ist die Slug-Zuordnung des Codes", () => {
    const aus = new Map([...code.matchAll(/\('([a-z0-9-]+)', '([a-z]+)'\)/g)].map((m) => [m[1], m[2]]));
    const erwartet = new Map(WIKI_KATEGORIEN.flatMap((k) => SLUGS_JE_KATEGORIE[k].map((s) => [s, k] as const)));
    for (const [slug, k] of erwartet) assert.equal(aus.get(slug), k, slug);
    for (const slug of aus.keys()) {
      if ((WIKI_KATEGORIEN as readonly string[]).includes(aus.get(slug) ?? "")) assert.ok(erwartet.has(slug), `${slug} nur in der Migration`);
    }
  });

  it("Thema und Produktbezug sind im Vokabularverzeichnis, damit ein benutzter Begriff nicht gelöscht wird", () => {
    assert.match(code, /\('wiki_category',\s+'kb_article', 'category',\s+false/);
    assert.match(code, /\('partner_format',\s+'kb_article', 'product_formats', true/);
  });

  it("der Produktfilter wirkt nach der Wahl Edition-vor-evergreen und ist kein Zugriffsschutz", () => {
    const fn = code.slice(code.indexOf("create function kb_articles("), code.indexOf("create function kb_article_by_slug"));
    assert.ok(fn.indexOf("distinct on (a.slug)") < fn.indexOf("p_formats is null or cardinality(k.product_formats) = 0"));
    assert.match(fn, /my_kb_audiences\(\)/);
    assert.match(fn, /v_allowed && array\[p_audience\]/);
    assert.match(sql, /Relevanz, kein\s+--\s+Zugriffsschutz|kein Zugriffsschutz/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("der Editor schreibt Thema und Produktbezug, der Produktbezug nur mit Partner-Zielgruppe", () => {
    const admin = lies("app/(admin)/admin/wiki/ArtikelFormular.tsx");
    assert.match(admin, /category: form\.category \|\| null/);
    assert.match(admin, /product_formats: form\.audience\.includes\("partner"\) \? form\.product_formats : \[\]/);
    assert.match(admin, /form\.audience\.includes\("partner"\) && \(/);
    const page = lies("app/(admin)/admin/wiki/page.tsx");
    assert.match(page, /vgroup\(vocab, "wiki_category"\)/);
    assert.match(page, /vgroup\(vocab, "partner_format"\)/);
  });

  it("das Portal kann nach Formaten filtern (loadArticles → p_formats), ohne Angabe nach nichts", () => {
    const load = lies("components/wiki/load.ts");
    assert.match(load, /p_formats: input\.formats \?\? null/);
  });

  it("die neuen Beschriftungen stehen in DE und EN", () => {
    for (const l of ["de", "en"]) {
      const d = JSON.parse(lies(`lib/i18n/${l}.json`)) as { wiki: Record<string, string> };
      for (const k of ["colProducts", "productsAll", "fieldTopic", "fieldTopicNone", "fieldProducts", "fieldProductsAll", "fieldProductsSome"]) {
        assert.ok(d.wiki[k], `${l}.wiki.${k}`);
      }
    }
  });
});
