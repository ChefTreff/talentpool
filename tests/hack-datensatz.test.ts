import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DATASET_MAX_BYTES, datasetPfad, pruefeDatensatz } from "@/lib/hackathon/datensatz";
import { migrationText } from "@/tests/migration-datei";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Datensatz je Challenge (HACK-012)", () => {
  const sql = migrationText("v6_hack_datensatz");

  it("Bucket privat, nur Lese-Policy, Tabelle ohne Grants", () => {
    assert.match(sql, /values \('hack-datasets', 'hack-datasets', false, 52428800/);
    assert.match(sql, /create policy "hack datasets read" on storage\.objects\s+for select to authenticated/);
    assert.doesNotMatch(sql, /create policy [^;]* on storage\.objects\s+for (insert|update|delete)/);
    assert.match(sql, /revoke all on hack_dataset from anon, authenticated/);
  });

  it("Leser sehen nur die aktuelle Datei, Verwalter alle Versionen", () => {
    const fn = sql.slice(sql.indexOf("create or replace function hack_dataset_path_allowed"), sql.indexOf("drop policy if exists \"hack datasets read\""));
    assert.match(fn, /if can_manage_hack_dataset\(v_challenge\) then return true/);
    assert.match(fn, /return v_d\.is_current and can_read_hack_dataset\(v_challenge\)/);
  });

  it("die Grenze in der App ist die des Buckets", () => {
    assert.equal(DATASET_MAX_BYTES, 52428800);
    assert.equal(pruefeDatensatz({ name: "a.csv", size: DATASET_MAX_BYTES + 1, type: "text/csv" }).ok, false);
    assert.deepEqual(pruefeDatensatz({ name: "daten.PARQUET", size: 10, type: "" }), { ok: true, mime: "application/octet-stream" });
    assert.equal(pruefeDatensatz({ name: "virus.exe", size: 10, type: "application/octet-stream" }).ok, false);
  });

  it("der Pfad liegt unter der Challenge und hat genau zwei Teile", () => {
    const p = datasetPfad("11111111-1111-1111-1111-111111111111", "../../Mein Datensatz ü.csv", "u");
    assert.equal(p.split("/").length, 2);
    assert.match(p, /^11111111-1111-1111-1111-111111111111\/u-[A-Za-z0-9._-]+$/);
  });

  it("die Route prüft das Recht vor dem Signieren und trägt mit der Sitzung ein", () => {
    const route = read("app/api/hackathon/dataset/route.ts");
    assert.ok(route.indexOf('rpc("can_manage_hack_dataset"') < route.indexOf("createSignedUploadUrl"));
    assert.match(route, /supabase\.rpc\("register_hack_dataset"/);
  });

  it("Downloads signiert die Sitzung der Person, nicht der Dienstschlüssel", () => {
    const srv = read("lib/hackathon/datensatz-server.ts");
    assert.doesNotMatch(srv, /createSupabaseAdminClient/);
  });
});
