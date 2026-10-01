import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { toRpcFailure } from "@/lib/rpc-error";
import { migrationText } from "@/tests/migration-datei";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Track-Wunsch in der Hackathon-Bewerbung (HACK-010)", () => {
  const sql = migrationText("v6_hack_track_praeferenz");

  it("prüft jeden Wunsch gegen das Vokabular und verlangt einen, sobald es Tracks gibt", () => {
    const fn = sql.slice(sql.indexOf("create or replace function apply_hackathon"), sql.indexOf("create or replace function my_hack"));
    assert.match(fn, /is_vocab_key\('hack_track', v_track\)/);
    assert.match(fn, /raise exception 'track_pref_missing'/);
    assert.match(fn, /track_prefs = excluded\.track_prefs/);
  });

  it("Admin-Liste bleibt ohne E-Mail und Telefon und hinter is_hack_team()", () => {
    const fn = sql.slice(sql.indexOf("create or replace function hack_applications_admin"));
    assert.match(fn, /is_hack_team\(\)/);
    assert.doesNotMatch(fn.slice(0, fn.indexOf("AS $$")), /mail|phone/i);
    assert.match(fn, /m\.edition_id = a\.edition_id/);
  });

  it("track_pref_missing hat einen Text in beiden Sprachen", () => {
    const f = toRpcFailure({ code: "22023", message: "track_pref_missing", details: "", hint: "", name: "PostgrestError" } as never);
    assert.equal(f.key, "track_pref_missing");
    for (const lang of ["de", "en"]) assert.ok(JSON.parse(read(`lib/i18n/${lang}.json`)).rpc.track_pref_missing, lang);
  });

  it("die Bewerbung schickt track_prefs mit", () => {
    assert.match(read("app/(hackathon)/hackathon/actions.ts"), /track_prefs: input\.trackPrefs \?\? \[\]/);
  });
});
