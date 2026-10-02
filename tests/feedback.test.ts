import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { adminSection } from "@/lib/admin-sections";
import { toRpcFailure } from "@/lib/rpc-error";
import { migrationText } from "@/tests/migration-datei";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Feedback-Fenster (TAL-011)", () => {
  const sql = migrationText("v6_feedback");
  const tabelle = sql.slice(sql.indexOf("create table if not exists feedback_entry"), sql.indexOf("comment on table feedback_entry"));
  const submit = sql.slice(sql.indexOf("create or replace function submit_feedback"), sql.indexOf("create or replace function feedback_admin"));

  it("anonym heißt wirklich anonym: kein Zeitstempel, keine Person, kein Audit", () => {
    assert.doesNotMatch(tabelle, /timestamptz|timestamp/);
    assert.match(submit, /case when coalesce\(p_anonymous, true\) then null else v_me end/);
    assert.doesNotMatch(submit.replace(/--.*$/gm, ""), /log_audit/);
  });

  it("das Tageslimit liegt in einer eigenen Tabelle ohne Uhrzeit", () => {
    const quota = sql.slice(sql.indexOf("create table if not exists feedback_quota"), sql.indexOf("comment on table feedback_quota"));
    assert.doesNotMatch(quota, /timestamp|body|feedback_entry/);
  });

  it("die Umfrage-Fragen sind übernommen, die Verlosung mit E-Mail nicht", () => {
    for (const q of ["overall", "programme", "expo", "masterclasses", "app", "side_events"]) assert.match(submit, new RegExp(`'${q}'`));
    assert.doesNotMatch(read("app/(talent)/feedback/FeedbackForm.tsx"), /type="email"/);
  });

  it("Abschnitt feedback in App und Datenbank gleich", () => {
    const rollen = [...adminSection("feedback").roles].sort();
    assert.deepEqual(rollen, ["area_lead_talent", "marketing_team", "talent_team"]);
    for (const r of rollen) assert.match(sql, new RegExp(`\\('feedback', '${r}'\\)`));
  });

  it("neue Fehlerschlüssel haben Texte", () => {
    for (const key of ["feedback_limit", "invalid_rating", "missing_field"]) {
      assert.equal(toRpcFailure({ code: "22023", message: key, details: "", hint: "", name: "PostgrestError" } as never).key, key);
      for (const lang of ["de", "en"]) assert.ok(JSON.parse(read(`lib/i18n/${lang}.json`)).rpc[key], `${lang}:${key}`);
    }
  });
});
