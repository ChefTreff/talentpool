import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { hatWunschprofil, passendeChallenges, type Wunschprofil } from "@/lib/hackathon/wunschprofil";
import { migrationText } from "@/tests/migration-datei";

const w = (id: string, study_fields: string[], skills: string[], profile: string | null = null): Wunschprofil => ({
  challenge_id: id, title: id, org_name: null, study_fields, skills, profile, can_edit: false,
});

describe("Wunschprofil je Challenge (HACK-015)", () => {
  it("Passung über Studienfeld oder gemeinsamen Skill; ohne Profil keine Passung", () => {
    const profile = [w("A", ["informatics"], []), w("B", [], ["data_analysis"]), w("C", [], [])];
    assert.deepEqual(passendeChallenges(profile, { study_field: "informatics", profile_skills: null }).map((x) => x.title), ["A"]);
    assert.deepEqual(passendeChallenges(profile, { study_field: null, profile_skills: ["data_analysis"] }).map((x) => x.title), ["B"]);
    assert.equal(hatWunschprofil(profile[2]), false);
    assert.equal(hatWunschprofil(w("D", [], [], "Satz")), true);
  });

  it("Pflege nur Hack-Team oder Partner mit Bearbeitungsrecht, Begriffe aus dem Vokabular", () => {
    const sql = migrationText("v6_hack_wunschprofil");
    const fn = sql.slice(sql.indexOf("create or replace function set_hack_challenge_profile"), sql.indexOf("create or replace function hack_challenge_profiles"));
    assert.match(fn, /is_hack_team\(\) or \(v_c\.org_id is not null and partner_can_edit\(v_c\.org_id\)\)/);
    assert.match(fn, /is_vocab_key\('study_field', v_k\)/);
    assert.match(fn, /is_vocab_key\('skill', v_k\)/);
    assert.match(fn, /log_audit\('hack\.challenge_profile'/);
  });
});
