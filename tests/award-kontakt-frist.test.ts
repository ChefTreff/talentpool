import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

describe("Award: Löschfrist der Ansprechperson (K-51)", () => {
  const sql = migrationText("v6_award_kontakt_frist");

  it("14 Monate nach dem Ende der Edition, nur die drei Kontaktfelder", () => {
    assert.match(sql, /e\.end_date \+ interval '14 months' < current_date/);
    assert.match(sql, /set contact_first_name = null, contact_last_name = null, contact_email = null, contact_purged_at = now\(\)/);
    assert.doesNotMatch(sql, /delete from award_(application|vote)/);
  });

  it("Cron ohne Sitzung oder Abschnitt initiatives; anon nicht", () => {
    assert.match(sql, /if auth\.uid\(\) is not null and not has_admin_section\('initiatives'\)/);
    assert.match(sql, /revoke execute on function award_purge_contacts\(\) from public, anon;/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("Cron-Route prüft CRON_SECRET vor der Service-Rolle und steht in vercel.json", () => {
    const r = readFileSync(new URL("../app/api/cron/award-kontakte/route.ts", import.meta.url), "utf8");
    assert.ok(r.indexOf("authorized(request)") < r.indexOf("createSupabaseAdminClient()"));
    const v = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { crons: { path: string }[] };
    assert.ok(v.crons.some((c) => c.path === "/api/cron/award-kontakte"));
  });
});
