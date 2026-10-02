import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { toRpcFailure } from "@/lib/rpc-error";
import { migrationText } from "@/tests/migration-datei";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Wunsch-Challenges in der Bewerbung (HACK-017)", () => {
  const sql = migrationText("v6_hack_challenge_praeferenz");

  it("nur freigegebene Challenges derselben Edition, höchstens drei", () => {
    const fn = sql.slice(sql.indexOf("create or replace function apply_hackathon"), sql.indexOf("drop function if exists hack_applications_admin"));
    assert.match(fn, /c\.edition_id = v_ed and c\.status = 'published'/);
    assert.match(fn, /cardinality\(v_prefs\) > 3/);
    assert.match(sql, /check \(cardinality\(challenge_prefs\) <= 3\)/);
  });

  it("die Bewerbung schickt die Wünsche ohne leere Plätze", () => {
    assert.match(read("app/(hackathon)/hackathon/actions.ts"), /challenge_prefs: \(input\.challengePrefs \?\? \[\]\)\.filter\(Boolean\)/);
  });

  it("invalid_challenge hat Texte", () => {
    const f = toRpcFailure({ code: "22023", message: "invalid_challenge", details: "", hint: "", name: "PostgrestError" } as never);
    assert.equal(f.key, "invalid_challenge");
    for (const lang of ["de", "en"]) assert.ok(JSON.parse(read(`lib/i18n/${lang}.json`)).rpc.invalid_challenge, lang);
  });
});
