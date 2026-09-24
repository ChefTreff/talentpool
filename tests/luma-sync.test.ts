import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { syncLuma, SYNC_LOOKBACK_DAYS } from "@/lib/luma/sync";
import { adminSection } from "@/lib/admin-sections";
import { migrationText } from "@/tests/migration-datei";
import type { LumaEvent, LumaGuest } from "@/lib/luma/types";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/luma/${name}.json`, import.meta.url), "utf8"));

describe("Luma-Rücklauf (TAL-007/008 Stufe 3)", () => {
  const events = (fixture("events-list").entries as LumaEvent[]);
  const guests = (fixture("guests-list").entries as LumaGuest[]);

  function deps(opts: { calendarId?: string | null; failGuestsFor?: string } = {}) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    let after: Date | null = null;
    return {
      calls,
      get after() { return after; },
      d: {
        listEvents: async (a: Date) => { after = a; return events; },
        listGuests: async (id: string) => {
          if (id === opts.failGuestsFor) throw new Error("boom");
          return id === "evt-oktober" ? guests : [];
        },
        rpc: async (fn: string, args: Record<string, unknown>) => {
          calls.push({ fn, args });
          // Person gibt es nur für Anna.
          if (fn === "luma_sync_registration") return { data: { matched: args.p_email === "anna@example.com" }, error: null };
          return { data: "uuid", error: null };
        },
        calendarId: opts.calendarId ?? null,
      },
    };
  }

  it("gleicht Events und Gäste ab, private übersprungen, Rückblick 60 Tage", async () => {
    const x = deps();
    const now = new Date("2026-09-24T12:00:00Z");
    const stats = await syncLuma(x.d, now);
    assert.deepEqual(stats, { events: 3, guests: 3, matched: 1, unmatched: 2, skippedPrivate: 1, errors: 0 });
    assert.equal(SYNC_LOOKBACK_DAYS, 60);
    assert.equal(x.after?.toISOString(), "2026-07-26T12:00:00.000Z");
    const reg = x.calls.filter((c) => c.fn === "luma_sync_registration");
    assert.deepEqual(reg[0].args, {
      p_luma_event_id: "evt-oktober", p_email: "anna@example.com", p_guest_id: "gst-1",
      p_status: "registered", p_registered_at: "2026-10-01T10:00:00.000Z", p_checked_in: true,
    });
  });

  it("nimmt nur Events des eigenen Kalenders", async () => {
    const x = deps({ calendarId: "cal-anders" });
    const stats = await syncLuma(x.d, new Date("2026-09-24T12:00:00Z"));
    assert.equal(stats.events, 0);
    assert.equal(x.calls.length, 0);
  });

  it("zählt Fehler beim Gäste-Abruf und macht mit dem nächsten Event weiter", async () => {
    const x = deps({ failGuestsFor: "evt-oktober" });
    const stats = await syncLuma(x.d, new Date("2026-09-24T12:00:00Z"));
    assert.equal(stats.errors, 1);
    assert.equal(stats.events, 3);
  });

  it("Admin-Abschnitt und can_view_community_events() nennen dieselben Rollen", () => {
    const sql = migrationText("v6_community_events_admin");
    const fn = sql.slice(sql.indexOf("function can_view_community_events"));
    const body = fn.slice(0, fn.indexOf("$$;", fn.indexOf("$$") + 2));
    const roles = [...body.matchAll(/has_role\('([a-z_]+)'\)/g)].map((m) => m[1]).filter((r) => r !== "admin").sort();
    assert.deepEqual([...adminSection("communityEvents").roles].sort(), roles);
  });

  it("der Cron schreibt erst mit LUMA_WRITE_ENABLED", () => {
    const route = readFileSync(new URL("../app/api/cron/luma-sync/route.ts", import.meta.url), "utf8");
    const gate = route.indexOf("if (!lumaWriteEnabled())");
    const admin = route.indexOf("createSupabaseAdminClient()");
    assert.ok(gate > 0 && gate < admin, "Trockenlauf vor dem ersten Dienstschlüssel");
    assert.match(route, /dryRun: true, stats/);
  });

  it("der Cron steht in vercel.json", () => {
    const v = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    assert.ok(v.crons.some((c: { path: string }) => c.path === "/api/cron/luma-sync"));
  });
});
