import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const sql = migrationText("v6_logokategorie");
const ohneKommentar = sql.replace(/--.*$/gm, "");

function funktion(name: string): string {
  const start = ohneKommentar.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `${name} fehlt`);
  return ohneKommentar.slice(start, ohneKommentar.indexOf("$$;", ohneKommentar.indexOf("AS $$", start) + 5));
}

describe("Logokategorie (ADM-046)", () => {
  it("die fünf Kategorien aus Konrads Antwort vom 25.09.", () => {
    for (const k of ["presenting", "premium", "official", "small", "startup"]) {
      assert.match(sql, new RegExp(`\\('logo_category', '${k}'`), k);
    }
  });

  it("Auffangsatz: ohne Feld und ohne Stufe ist es official — niemand rutscht durch", () => {
    assert.match(funktion("logo_category_of"), /coalesce\(\(select key from feld\), \(select key from abgeleitet\), 'official'\)/);
    assert.match(funktion("event_app_exhibitors"), /'official_partner'\)/);
  });

  it("Swapcard liest die Kategorie aus dem neuen Feld, nicht mehr direkt aus der Stufe", () => {
    const f = funktion("event_app_exhibitors");
    assert.match(f, /c\.vocabulary = 'logo_category' and c\.key = lc\.category/);
    assert.doesNotMatch(f, /l\.vocabulary = 'sponsoring_level'[^;]*parent_vocabulary = 'swapcard_sponsor_category'/);
  });

  it("die Ableitung ist intern, Setzen nur mit Abschnitt logoWall und Audit", () => {
    assert.match(sql, /revoke execute on function logo_category_of\(uuid\) from public, anon, authenticated;/);
    const set = funktion("set_logo_category");
    assert.match(set, /errcode = '28000'/);
    assert.match(set, /has_admin_section\('logoWall'\)/);
    assert.match(set, /log_audit\('partner\.logo_category'/);
  });

  it("endet mit harden_definer_functions()", () => {
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("die CSV der Foto-Wand führt die Kategorie, über lib/csv", () => {
    const csv = readFileSync(new URL("../app/(admin)/admin/partner/logos/csv/route.ts", import.meta.url), "utf8");
    assert.match(csv, /"Logokategorie"/);
    assert.match(csv, /map\(csvCell\)/);
  });
});
