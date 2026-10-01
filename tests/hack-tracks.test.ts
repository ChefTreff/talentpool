import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { toRpcFailure } from "@/lib/rpc-error";
import { migrationText } from "@/tests/migration-datei";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Hackathon-Tracks (HACK-008)", () => {
  const sql = migrationText("v6_hack_tracks");

  it("legt die drei Tracks als Vokabular an und bindet sie an hack_challenge.track", () => {
    for (const key of ["physical_ai", "data_science", "concept"]) assert.match(sql, new RegExp(`'hack_track', '${key}'`));
    assert.match(sql, /insert into vocab_binding[\s\S]*'hack_track', 'hack_challenge', 'track'/);
  });

  it("Freigabe ohne Track wird abgewiesen, on conflict trifft den partiellen Index", () => {
    const fn = sql.slice(sql.indexOf("create or replace function publish_hack_challenge"), sql.indexOf("create or replace function set_hack_challenge_track"));
    assert.match(fn, /raise exception 'track_missing'/);
    assert.match(fn, /on conflict \(deliverable_id\) where deliverable_id is not null/);
    assert.match(fn, /is_hack_team\(\)/);
  });

  it("Track ändern prüft Rechte, Vokabular und schreibt Audit", () => {
    const fn = sql.slice(sql.indexOf("create or replace function set_hack_challenge_track"));
    assert.match(fn, /is_hack_team\(\)/);
    assert.match(fn, /is_vocab_key\('hack_track'/);
    assert.match(fn, /log_audit\('hack\.challenge_track'/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("track_missing hat einen Text in beiden Sprachen", () => {
    const f = toRpcFailure({ code: "22023", message: "track_missing", details: "", hint: "", name: "PostgrestError" } as never);
    assert.equal(f.key, "track_missing");
    for (const lang of ["de", "en"]) {
      const dict = JSON.parse(read(`lib/i18n/${lang}.json`));
      assert.ok(dict.rpc.track_missing, lang);
    }
  });

  it("Freigabe schickt den gewählten Track mit; Admin ändert über den Abschnitt", () => {
    assert.match(read("app/(hackathon)/hackathon/actions.ts"), /p_track: track \|\| null/);
    const admin = read("app/(admin)/admin/hackathon/actions.ts");
    const fn = admin.slice(admin.indexOf("export async function setChallengeTrack"));
    assert.match(fn, /requireAdminSection\("hackathon"\)/);
  });
});
