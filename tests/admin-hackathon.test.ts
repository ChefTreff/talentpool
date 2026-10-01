import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { adminSection, canEnterAdminSection } from "@/lib/admin-sections";
import { migrationText } from "@/tests/migration-datei";

describe("Admin-Abschnitt Hackathon (ADM-055)", () => {
  it("öffnet Hackathon-Leitung und Hackathon-Team, sonst niemanden außer admin", () => {
    assert.deepEqual([...adminSection("hackathon").roles].sort(), ["area_lead_hackathon", "hackathon_team"]);
    assert.equal(canEnterAdminSection("hackathon", ["hackathon_team"]), true);
    assert.equal(canEnterAdminSection("hackathon", ["area_lead_partner"]), false);
    assert.equal(canEnterAdminSection("hackathon", ["hackathon_partner"]), false);
  });

  it("is_hack_team() fragt den Abschnitt statt Rollen abzuschreiben", () => {
    const sql = migrationText("v6_admin_hackathon");
    const fn = sql.slice(sql.indexOf("create or replace function is_hack_team"), sql.indexOf("create or replace function hack_applications_admin"));
    assert.match(fn, /has_admin_section\('hackathon'\)/);
    assert.doesNotMatch(fn.replace(/--.*$/gm, ""), /has_role\(/);
  });

  it("die Teilnehmer-App liest offene Challenges über die Leserolle", () => {
    const page = readFileSync(new URL("../app/(hackathon)/hackathon/teams/page.tsx", import.meta.url), "utf8");
    assert.match(page, /rpc\("hack_open_challenges"\)/);
    assert.doesNotMatch(page, /from\("deliverable"\)/);
  });
});
