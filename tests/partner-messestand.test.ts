import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { meterAngabe, rueckwandMeter } from "@/app/(partner)/partner/messestand/masse";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Messestand (PART-084…087)", () => {
  it("Maße als „5x6 m“ — Standgröße aus dem Produkt, Rückwand aus Millimetern", () => {
    assert.equal(meterAngabe("3 m × 3 m"), "3x3 m");
    assert.equal(meterAngabe("1 m × 1,5 m"), "1x1,5 m");
    assert.equal(meterAngabe("6m x 3m"), "6x3 m");
    assert.equal(meterAngabe("nach Absprache"), "nach Absprache");
    assert.equal(meterAngabe(null), null);
    assert.equal(rueckwandMeter(3000, 2500, "de-DE"), "3x2,5 m");
    assert.equal(rueckwandMeter(5000, 2500, "en-GB"), "5x2.5 m");
  });

  it("die Rückwand steht vor der Ausstattung, beide Knöpfe gleich hoch", () => {
    const seite = src("app/(partner)/partner/messestand/page.tsx");
    assert.ok(seite.indexOf('aria-labelledby="rueckwand"') < seite.indexOf('aria-labelledby="ausstattung"'));
    assert.match(src("app/(partner)/partner/messestand/Rueckwand.tsx"), /variant="secondary" className="min-h-11"/);
  });

  it("nur der gebuchte Stand, mit Hinweis vor dem Messeshop-Knopf", () => {
    const seite = src("app/(partner)/partner/messestand/page.tsx");
    assert.match(seite, /packages\.filter\(\(p\) => ownSkus\.has\(p\.sku\)\)/);
    assert.ok(seite.indexOf("b.equipShopHint") < seite.indexOf('href="/partner/shop"'));
    for (const sprache of ["de", "en"]) {
      const b = JSON.parse(src(`lib/i18n/${sprache}.json`)).partnerBooth as Record<string, string>;
      for (const key of ["equipShopHint", "equipNoneTitle", "equipNoneBody", "backSize"]) {
        assert.equal(typeof b[key], "string", `${sprache}: partnerBooth.${key}`);
      }
      assert.match(b.backSize, /\{masse\}/);
      // Die Rückwand steht jetzt über der Tabelle — der Text verweist nach unten.
      assert.match(b.backBody, sprache === "de" ? /Tabelle unten/ : /table below/);
    }
  });

  it("Stammdaten als Migration: Eigenproduktion mit Strom, Teppich, Beleuchtung; Agency still; Liste ohne Initiativen-Stände", () => {
    const sql = migrationText("v6_standpakete_eigenproduktion");
    assert.match(sql, /\('I-84869', 'I-76440', 1\), \('I-84869', 'I-73593', 9\),\s+\('I-84869', 'I-62157', 1\)/);
    assert.match(sql, /\('I-36848', 'I-76440', 1\), \('I-36848', 'I-73593', 18\), \('I-36848', 'I-62157', 1\)/);
    assert.match(sql, /update product set active = false where sku = 'I-40175'/);
    assert.doesNotMatch(sql, /delete from product/);
    assert.match(sql, /and p\.format_key in \('booth', 'stage'\)/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("Testdaten: Dummy-Stand über booth_assignment, --remove ohne die entfallene Spalte", () => {
    const skript = src("scripts/testdaten-konrad.mjs");
    assert.match(skript, /async function partnerStand\(oeId\)/);
    assert.match(skript, /from\("booth_assignment"\)\.insert\(\{ booth_id: stand\.id, org_edition_id: oeId/);
    assert.doesNotMatch(skript, /from\("booth"\)\.delete\(\)\.eq\("org_edition_id"/);
  });
});
