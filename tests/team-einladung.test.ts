import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const sql = migrationText("v6_team_einladung");
const actions = readFileSync(new URL("../app/(admin)/admin/verwaltung/zugaenge/actions.ts", import.meta.url), "utf8");

describe("Teammitglied einladen (QS-056)", () => {
  it("nur Abschnitt access, nur Team-Rollen ohne admin, Rollen über assign_role", () => {
    assert.match(sql, /has_admin_section\('access'\)/);
    assert.match(sql, /v_rolle = 'admin' or not \(v_rolle = any \(team_role_keys\(\)\)\)/);
    assert.match(sql, /perform assign_role\(/);
    assert.match(sql, /log_audit\('access\.team_member'/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("die Einladung geht an die Adresse aus der Datenbank (über ladeEin), nicht an die eingetippte", () => {
    const fn = actions.slice(actions.indexOf("export async function ladeTeamEin"));
    assert.match(fn, /rpc\("create_team_member"/);
    assert.match(fn, /await ladeEin\(r\.person_id\)/);
    assert.doesNotMatch(fn, /inviteUserByEmail\(email/);
  });

  it("die Seite bietet admin nicht an", () => {
    const page = readFileSync(new URL("../app/(admin)/admin/verwaltung/zugaenge/page.tsx", import.meta.url), "utf8");
    assert.match(page, /alleRollen\.filter\(\(r\) => r\.value !== "admin"\)/);
    assert.match(page, /<TeamEinladung[^>]*rollen=\{rollen\}/);
  });
});
