import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { pruefeAbgabeDatei, SUBMISSION_MAX_BYTES, SUBMISSION_MAX_FILES } from "@/lib/hackathon/abgabe";
import { toRpcFailure } from "@/lib/rpc-error";
import { migrationText } from "@/tests/migration-datei";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Abgabe über das Portal (HACK-011)", () => {
  const sql = migrationText("v6_hack_abgabe");

  it("Bucket privat, nur Lese-Policy, Tabelle ohne Grants", () => {
    assert.match(sql, /values \('hack-submissions', 'hack-submissions', false, 52428800/);
    assert.match(sql, /create policy "hack submissions read" on storage\.objects\s+for select to authenticated/);
    assert.doesNotMatch(sql, /create policy [^;]* on storage\.objects\s+for (insert|update|delete)/);
    assert.match(sql, /revoke all on hack_submission_file from anon, authenticated/);
  });

  it("die Frist prüft der Server; danach nur verspätet, nie gesperrt", () => {
    const sub = sql.slice(sql.indexOf("create or replace function submit_hack"), sql.indexOf("create or replace function my_hack"));
    assert.match(sub, /v_late := hack_submission_is_late\(v_team\)/);
    const reg = sql.slice(sql.indexOf("create or replace function register_hack_submission_file"), sql.indexOf("create or replace function remove_hack_submission_file"));
    assert.match(reg, /v_late := hack_submission_is_late\(p_team_id\)/);
    assert.doesNotMatch(reg, /deadline_passed/);
  });

  it("Grenzen in App und Datenbank stimmen überein", () => {
    assert.equal(SUBMISSION_MAX_BYTES, 52428800);
    assert.match(sql, />= 10 then\s+raise exception 'too_many_files'/);
    assert.equal(SUBMISSION_MAX_FILES, 10);
    assert.equal(pruefeAbgabeDatei({ name: "demo.mp4", size: SUBMISSION_MAX_BYTES + 1, type: "video/mp4" }).ok, false);
    assert.equal(pruefeAbgabeDatei({ name: "pitch.key", size: 10, type: "" }).ok, true);
    assert.equal(pruefeAbgabeDatei({ name: "x.exe", size: 10, type: "" }).ok, false);
  });

  it("die Route prüft das Team vor dem Signieren und entfernt erst die Zeile", () => {
    const route = read("app/api/hackathon/submission/route.ts");
    assert.ok(route.indexOf('rpc("can_write_hack_submission"') < route.indexOf("createSignedUploadUrl"));
    const del = route.slice(route.indexOf("export async function DELETE"));
    assert.ok(del.indexOf('rpc("remove_hack_submission_file"') < del.indexOf(".remove(["));
  });

  it("too_many_files hat Texte in beiden Sprachen", () => {
    const f = toRpcFailure({ code: "22023", message: "too_many_files", details: "", hint: "", name: "PostgrestError" } as never);
    assert.equal(f.key, "too_many_files");
    for (const lang of ["de", "en"]) assert.ok(JSON.parse(read(`lib/i18n/${lang}.json`)).rpc.too_many_files, lang);
  });

  it("Frist im Admin hinter dem Abschnitt hackathon", () => {
    const admin = read("app/(admin)/admin/hackathon/actions.ts");
    const fn = admin.slice(admin.indexOf("export async function setChallengeDeadline"));
    assert.match(fn.slice(0, 300), /requireAdminSection\("hackathon"\)/);
  });
});
