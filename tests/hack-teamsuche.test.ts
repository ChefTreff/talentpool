import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { toRpcFailure } from "@/lib/rpc-error";
import { migrationText } from "@/tests/migration-datei";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const fnText = (sql: string, name: string) => {
  const start = sql.indexOf(`create or replace function ${name}`);
  return sql.slice(start, sql.indexOf("end $$;", start));
};

describe("Teamsuche (HACK-016)", () => {
  const sql = migrationText("v6_hack_teamsuche");

  it("Anfragen liegen in einer Tabelle ohne Grants", () => {
    assert.match(sql, /alter table hack_join_request enable row level security/);
    assert.match(sql, /revoke all on hack_join_request from anon, authenticated/);
  });

  it("die Personenliste gibt keine Kontaktdaten und keinen Nachnamen heraus", () => {
    const fn = fnText(sql, "hack_people_search");
    const kopf = fn.slice(0, fn.indexOf("AS $$"));
    assert.doesNotMatch(kopf, /last_name|mail|phone|linkedin|url/i);
    assert.match(fn, /a\.status = 'accepted' and a\.seeking_team/);
  });

  it("die Zusage prüft die Beitrittsregeln erneut unter Zeilensperre", () => {
    const fn = fnText(sql, "answer_hack_request");
    assert.match(fn, /from hack_team where id = v_r\.team_id for update/);
    assert.match(fn, /already_in_team/);
    assert.match(fn, /team_not_looking/);
    assert.match(fn, /v_n >= 8 then raise exception 'team_full'/);
  });

  it("der Schalter sagt, was Teams sehen (Einwilligung durch die Handlung)", () => {
    for (const lang of ["de", "en"]) {
      const hint: string = JSON.parse(read(`lib/i18n/${lang}.json`)).hackSearch.seekingHint;
      for (const wort of lang === "de" ? ["Vorname", "Studienfeld", "Skills", "Track-Wunsch", "keine Kontaktdaten"] : ["first name", "field of study", "skills", "preferred tracks", "no contact details"]) {
        assert.ok(hint.includes(wort), `${lang}: ${wort}`);
      }
    }
  });

  it("neue Fehlerschlüssel haben Texte", () => {
    for (const key of ["not_participant", "not_captain", "team_not_looking", "person_not_seeking", "request_pending", "request_closed"]) {
      const f = toRpcFailure({ code: "P0001", message: key, details: "", hint: "", name: "PostgrestError" } as never);
      assert.equal(f.key, key);
      for (const lang of ["de", "en"]) assert.ok(JSON.parse(read(`lib/i18n/${lang}.json`)).rpc[key], `${lang}:${key}`);
    }
  });
});
