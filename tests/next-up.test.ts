import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { adminSection, canEnterAdminSection } from "@/lib/admin-sections";

const migration = migrationText("v6_next_up");

describe("Next Up (TAL-006)", () => {
  it("Admin-Abschnitt und can_edit_next_up() nennen dieselben Rollen", () => {
    const fn = migration.match(/function can_edit_next_up\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/)?.[1] ?? "";
    const sql = [...fn.matchAll(/has_role\('([a-z_]+)'\)/g)].map((m) => m[1]).filter((r) => r !== "admin").sort();
    assert.deepEqual([...adminSection("nextUp").roles].sort(), sql);
  });

  it("öffnet den Abschnitt für Marketing und Talent-Leitung, nicht für andere Leads", () => {
    assert.equal(canEnterAdminSection("nextUp", ["marketing_team"]), true);
    assert.equal(canEnterAdminSection("nextUp", ["area_lead_talent"]), true);
    assert.equal(canEnterAdminSection("nextUp", ["area_lead_partner"]), false);
    assert.equal(canEnterAdminSection("nextUp", ["production_team"]), false);
  });

  it("Home zeigt die Sektion nur mit Einträgen und die Volunteer-Kachel", () => {
    const home = readFileSync(new URL("../app/(talent)/start/page.tsx", import.meta.url), "utf8");
    assert.match(home, /nextUp\.length > 0 &&/);
    assert.match(home, /<VolunteerInvite/);
    assert.match(home, /next_up_items/);
  });
});
