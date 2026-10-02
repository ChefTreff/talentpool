import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { adminSection, canEnterAdminSection } from "@/lib/admin-sections";
import { migrationText } from "@/tests/migration-datei";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Benachrichtigungen (TAL-009)", () => {
  const sql = migrationText("v6_benachrichtigungen");

  it("Academy und Bootcamp sind getrennte Themen (K-43)", () => {
    assert.match(sql, /'notification_topic', 'bootcamp'/);
    assert.match(sql, /'notification_topic', 'academy'/);
  });

  it("Abschnitt in App und Datenbank mit denselben Rollen", () => {
    const rollen = [...adminSection("notifications").roles].sort();
    assert.deepEqual(rollen, ["area_lead_talent", "marketing_team", "talent_team"]);
    for (const r of rollen) assert.match(sql, new RegExp(`\\('notifications', '${r}'\\)`));
    assert.equal(canEnterAdminSection("notifications", ["partner_team"]), false);
  });

  it("anschreibbar = Newsletter erteilt, nicht gelöscht, nicht gesperrt; Export mit Audit", () => {
    const fn = sql.slice(sql.indexOf("create or replace function notification_reachable"), sql.indexOf("create or replace function notification_topic_stats"));
    assert.match(fn, /c\.consent_type = 'newsletter' and c\.granted/);
    assert.match(fn, /suppression/);
    assert.match(sql, /log_audit\('export\.notification_topic'/);
  });

  it("Themen schränken den Newsletter ein: keine Themen heißt widerrufen", () => {
    const act = read("app/(talent)/benachrichtigungen/actions.ts");
    assert.match(act, /\{ newsletter: gewaehlt\.length > 0 \}/);
  });

  it("der Export läuft über csvCell", () => {
    assert.match(read("app/api/admin/benachrichtigungen/export/route.ts"), /map\(csvCell\)/);
  });
});
