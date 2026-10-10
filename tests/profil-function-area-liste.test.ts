import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { PROFILE_MULTI_VOCABS } from "@/app/(talent)/profil/felder";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Fachbereiche als Liste am Teilnehmerprofil (K-94 Stufe 1, Teil B)", () => {
  it("`function_area` gehört zu den Listen, die das Profil in `person_interest` pflegt — nicht mehr zu den Einzelfeldern", () => {
    assert.ok((PROFILE_MULTI_VOCABS as readonly string[]).includes("function_area"));
    assert.doesNotMatch(src("app/(talent)/profil/felder.ts").replace(/\/\*[\s\S]*?\*\//g, ""), /function_area: string;/);
    const actions = src("app/(talent)/profil/actions.ts");
    assert.match(actions, /function_area: string\[\];/);
    assert.doesNotMatch(actions, /function_area: nn\(/, "die Spalte person.function_area wird nicht mehr geschrieben");
  });

  it("die Seite liest die Liste, das Formular zeigt eine Mehrfachauswahl im Abschnitt Karriere", () => {
    const page = src("app/(talent)/profil/page.tsx");
    assert.match(page, /function_area: termsOf\("function_area"\)/);
    assert.doesNotMatch(page, /function_area: ext\./);
    const form = src("app/(talent)/profil/ProfileForm.tsx");
    assert.match(form, /options=\{vocab\.function_area\}\s+selected=\{form\.function_area\}\s+onToggle=\{\(k\) => toggle\("function_area", k\)\}/);
    assert.doesNotMatch(form, /setExt\("function_area"/);
  });

  it("die Admin-Person zeigt die Liste als Badges und rechnet sie nicht zu den „weiteren Interessen“", () => {
    const admin = src("app/(admin)/admin/personen/[id]/page.tsx");
    assert.match(admin, /badges\(extra\("function_area"\)\)/);
    assert.match(admin, /PROFILE_EXTRA = \[[^\]]*"function_area"/);
  });

  it("die Migration erlaubt das Vokabular, kopiert den Bestand einmal und löscht nichts", () => {
    const sql = migrationText("v6_profil_function_area_liste");
    assert.match(sql, /'notification_topic', 'function_area'\)\)/);
    assert.match(sql, /insert into person_interest[\s\S]*from person p[\s\S]*on conflict do nothing/);
    assert.doesNotMatch(sql, /drop column|delete from person/i);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("beide Sprachen führen den neuen Wortlaut „Fachbereiche“", () => {
    for (const loc of ["de", "en"]) {
      const text = src(`lib/i18n/${loc}.json`);
      assert.doesNotMatch(text, /Where do you mainly work\?|Wo arbeitest du hauptsächlich\?/, loc);
    }
    assert.match(src("lib/i18n/de.json"), /"functionArea": "Fachbereiche, in denen du arbeiten möchtest"/);
  });
});
