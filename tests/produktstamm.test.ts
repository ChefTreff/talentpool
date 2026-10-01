import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { adminSection } from "@/lib/admin-sections";
import { migrationText } from "@/tests/migration-datei";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Produktstamm pflegen (PROD-006)", () => {
  it("Abschnitt productCatalog für Produktion und Partner-Team, in der Datenbank gespiegelt", () => {
    assert.deepEqual([...adminSection("productCatalog").roles].sort(), ["area_lead_partner", "area_lead_production", "partner_team", "production_team"]);
    const sql = migrationText("v6_produktstamm_pflege");
    for (const r of ["admin", "area_lead_production", "production_team", "area_lead_partner", "partner_team"]) {
      assert.match(sql, new RegExp(`\\('productCatalog', '${r}'\\)`), r);
    }
    assert.equal((sql.match(/has_admin_section\('productCatalog'\)/g) ?? []).length, 3);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("Bild-Route: Gate vor der Service-Rolle, neu gerechnet, Eintrag über die Sitzung, Löschen nur unter der eigenen SKU", () => {
    const r = lies("app/api/admin/products/bild/route.ts");
    const post = r.slice(r.indexOf("export async function POST"));
    assert.ok(post.indexOf("requireAnyAdminSection") < post.indexOf("createSupabaseAdminClient()"));
    assert.match(post, /await verkleinere\(/);
    assert.match(r, /async function schreibe[\s\S]*createSupabaseServerClient\(\)[\s\S]*rpc\("upsert_product"/);
    assert.match(r, /!pfad\.startsWith\(`\$\{sku\}\/`\)/);
  });

  it("die Produktion schreibt mit eigenem Gate, der Abgleich erscheint nur mit dem Abschnitt partner", () => {
    const a = lies("app/(admin)/admin/produktion/produkte/actions.ts");
    assert.equal((a.match(/requireAdminSection\("productCatalog", PFAD\)/g) ?? []).length, 2);
    const p = lies("app/(admin)/admin/produktion/produkte/page.tsx");
    assert.match(p, /mayEnterAdminSection\("partner", ctx\.roleNames\)/);
    assert.match(p, /darfAbgleich \? ladeAbgleich\(admin\) : Promise\.resolve\(null\)/);
    assert.match(p, /speichern=\{saveProduct\}/);
  });

  it("der Abgleich je Artikel nutzt die vorhandene Route, Trockenlauf zuerst", () => {
    const x = lies("app/(admin)/admin/partner/produkte/ProduktExtras.tsx");
    assert.match(x, /postJson<\{ runs: Lauf\[\] \}>\("\/api\/admin\/products\/sync", \{ dryRun: trocken, skus: \[sku\] \}\)/);
    assert.match(x, /disabled=\{laeuft \|\| !vorschau\}/);
  });
});
