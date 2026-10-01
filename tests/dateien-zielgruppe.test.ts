import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Zielgruppe der Editionsdateien (PROD-009)", () => {
  it("das Formular schickt die Zielgruppe mit, die Route reicht sie an set_edition_file weiter", () => {
    assert.match(lies("app/(admin)/admin/produktion/dateien/DateienView.tsx"), /mitZielgruppe \? \{ audience: zielgruppe \}/);
    assert.match(lies("app/api/produktion/edition-files/route.ts"), /Array\.isArray\(body\.audience\) \? \{ audience:/);
  });

  it("Ändern einer Zeile schickt die Art mit — sonst fiele sie auf sonstiges", () => {
    assert.match(lies("app/(admin)/admin/produktion/dateien/actions.ts"), /p_data: \{ id, kind, audience \}/);
  });

  it("Bestand: nur Hallenpläne mit allen fünf Zielgruppen verlieren speaker", () => {
    const sql = migrationText("v6_hallenplan_zielgruppe");
    assert.match(sql, /set audience = array_remove\(audience, 'speaker'\)/);
    assert.match(sql, /where kind = 'hallenplan'\s+and audience @> '\{partner,speaker,talent,volunteer,hackathon\}'::text\[\];/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});
