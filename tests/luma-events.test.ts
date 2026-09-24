import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Community-Events (TAL-007 Stufe 2)", () => {
  const action = src("app/(talent)/events/actions.ts");

  it("prüft Bereich, Freischaltung und Kalender, bevor irgendetwas geschrieben wird", () => {
    const gate = action.indexOf('requireArea("talent"');
    const live = action.indexOf("lumaWriteEnabled()");
    const unser = action.indexOf("isOurEvent(ev)");
    const add = action.indexOf("addGuests(");
    const admin = action.indexOf("createSupabaseAdminClient()");
    assert.ok(gate > 0 && gate < live && live < unser && unser < add && add < admin, "Reihenfolge der Prüfungen");
    assert.match(action, /\{ live: true \}/);
  });

  it("die Event-Seite zeigt nur Events unseres Kalenders", () => {
    assert.match(src("app/(talent)/events/[id]/page.tsx"), /!isOurEvent\(ev\)/);
  });

  it("die Sync-Funktionen sind nur für den Server", () => {
    const sql = migrationText("v6_luma_events");
    assert.match(sql, /revoke execute on function luma_sync_event\(jsonb\) from public, anon, authenticated/);
    assert.match(sql, /revoke execute on function luma_sync_registration\([^)]*\) from public, anon, authenticated/);
  });

  it("Events stehen oben im Menü, nicht in der Summit-Gruppe", () => {
    const layout = src("app/(talent)/layout.tsx");
    const events = layout.indexOf('href: "/events"');
    const summit = layout.indexOf("t.talentSummit.groupLabel");
    assert.ok(events > 0 && events < summit);
  });
});
