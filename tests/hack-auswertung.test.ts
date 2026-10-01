import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { toRpcFailure } from "@/lib/rpc-error";
import { migrationText } from "@/tests/migration-datei";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const fnText = (sql: string, name: string) => {
  const start = sql.indexOf(`create or replace function ${name}`);
  const end = sql.indexOf("end $$;", start);
  return sql.slice(start, end);
};

describe("Auswertungsart je Challenge (HACK-009)", () => {
  const sql = migrationText("v6_hack_auswertung");

  it("Metrik-Werte liegen in einer Tabelle ohne Grants, nur über Funktionen erreichbar", () => {
    assert.match(sql, /alter table hack_metric_result enable row level security/);
    assert.match(sql, /revoke all on hack_metric_result from anon, authenticated/);
    assert.doesNotMatch(sql, /grant [a-z, ]+ on hack_metric_result/i);
  });

  it("eintragen dürfen eigenes Team und Jury der Challenge, bestätigen nur das Hack-Team", () => {
    const set = fnText(sql, "set_hack_metric");
    assert.match(set, /my_hack_team_id\(v_ed\)/);
    assert.match(set, /can_judge_hack_team\(p_team_id\)/);
    assert.match(set, /not_metric_challenge/);
    assert.match(fnText(sql, "confirm_hack_metric"), /if not is_hack_team\(\)/);
    assert.match(fnText(sql, "set_hack_challenge_judging"), /if not is_hack_team\(\)/);
  });

  it("ein geänderter Wert verliert die Bestätigung", () => {
    assert.match(fnText(sql, "set_hack_metric"), /confirmed_at = case when hack_metric_result\.value = excluded\.value/);
  });

  it("das Leaderboard zeigt Dritten nur bestätigte Werte und keine Personen", () => {
    const lb = fnText(sql, "hack_leaderboard");
    assert.match(lb, /r\.confirmed_at is not null or v_all or t\.id = v_mine/);
    assert.doesNotMatch(lb.slice(0, lb.indexOf("AS $$")), /person|name text, .*mail/i);
  });

  it("neue Fehlerschlüssel haben Texte in beiden Sprachen", () => {
    for (const key of ["not_metric_challenge", "metric_label_missing", "invalid_metric"]) {
      const f = toRpcFailure({ code: "22023", message: key, details: "", hint: "", name: "PostgrestError" } as never);
      assert.equal(f.key, key);
      for (const lang of ["de", "en"]) assert.ok(JSON.parse(read(`lib/i18n/${lang}.json`)).rpc[key], `${lang}:${key}`);
    }
  });

  it("Admin-Aktionen prüfen den Abschnitt hackathon", () => {
    const admin = read("app/(admin)/admin/hackathon/actions.ts");
    for (const fn of ["setChallengeJudging", "confirmMetric"]) {
      const body = admin.slice(admin.indexOf(`export async function ${fn}`));
      assert.match(body.slice(0, 300), /requireAdminSection\("hackathon"\)/, fn);
    }
  });
});
