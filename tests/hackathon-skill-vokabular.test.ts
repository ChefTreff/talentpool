import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Hackathon-Skills auf das Vokabular `skill` (K-94 Stufe 1, Teil B)", () => {
  const sql = migrationText("v6_hackathon_skill_vokabular");
  const funktionen = sql.slice(sql.indexOf("create or replace function apply_hackathon"), sql.indexOf("-- 2 Bestand: einmalig"));

  it("beide Funktionen prüfen gegen `skill`, nicht mehr gegen `hack_skill`", () => {
    assert.match(funktionen, /is_vocab_key\('skill', v_skill\)/);
    assert.match(funktionen, /is_vocab_key\('skill', v_k\)/);
    assert.doesNotMatch(funktionen, /hack_skill/);
    assert.match(funktionen, /raise exception 'invalid_skill'/);
    assert.match(funktionen, /cardinality\(v_skills\) > 8/);
  });

  it("die Abbildung des Bestands entspricht der Entscheidung (frontend/backend → programming, data → data_analysis + ai_ml, …) und lässt hardware weg", () => {
    assert.match(sql, /\('frontend', array\['programming'\]\), \('backend', array\['programming'\]\)/);
    assert.match(sql, /\('data', array\['data_analysis', 'ai_ml'\]\)/);
    assert.match(sql, /\('business', array\['strategy', 'communication'\]\)/);
    assert.match(sql, /\('hardware', array\[\]::text\[\]\)/);
    assert.match(sql, /update hack_application/);
    assert.match(sql, /update hack_team/);
  });

  it("die Gruppe `hack_skill` wird inaktiv, nichts wird gelöscht; die Migration endet gehärtet", () => {
    assert.match(sql, /update vocab_term set active = false where vocabulary = 'hack_skill'/);
    assert.doesNotMatch(sql, /delete from vocab_term/i);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("Hackathon-Seiten, Admin-Hackathon und Testdaten lesen `skill` statt `hack_skill`", () => {
    for (const p of ["app/(hackathon)/hackathon/page.tsx", "app/(admin)/admin/hackathon/page.tsx", "scripts/testdaten-konrad.mjs"]) {
      assert.doesNotMatch(src(p).replace(/\/\/[^\n]*hack_skill[^\n]*\n/g, ""), /"hack_skill"/, p);
    }
    assert.match(src("app/(hackathon)/hackathon/page.tsx"), /skills: vgroup\(vocab, "skill"\)/);
    assert.match(src("app/(hackathon)/hackathon/page.tsx"), /skills=\{vgroup\(vocab, "skill"\)\}/);
  });
});
