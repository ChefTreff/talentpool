import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { adminSection } from "@/lib/admin-sections";
import { PHOTO_MAX_BYTES, pruefeFoto } from "@/lib/fotos/regeln";
import { toRpcFailure } from "@/lib/rpc-error";
import { migrationText } from "@/tests/migration-datei";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Event-Fotos (TAL-010)", () => {
  const sql = migrationText("v6_event_fotos");

  it("Bucket privat mit nur einer Lese-Policy, Tabellen ohne Grants", () => {
    assert.match(sql, /values \('event-photos', 'event-photos', false, 15728640/);
    assert.match(sql, /create policy "event photos read" on storage\.objects\s+for select to authenticated/);
    assert.doesNotMatch(sql, /create policy [^;]* on storage\.objects\s+for (insert|update|delete)/);
    assert.match(sql, /revoke all on event_photo from anon, authenticated/);
    assert.match(sql, /revoke all on event_photo_removal_request from anon, authenticated/);
  });

  it("Teilnahme heißt eingecheckt (Ticket) oder attended (Community) — No-Shows nicht", () => {
    const fn = sql.slice(sql.indexOf("create or replace function attended_event"), sql.indexOf("create or replace function can_manage_event_photos"));
    assert.match(fn, /t\.checked_in_at is not null or t\.status = 'checked_in'/);
    assert.match(fn, /r\.status = 'attended'/);
    assert.doesNotMatch(fn, /'valid'|'confirmed'/);
  });

  it("Abschnitt photos in App und Datenbank gleich", () => {
    const rollen = [...adminSection("photos").roles].sort();
    assert.deepEqual(rollen, ["area_lead_talent", "marketing_team", "talent_team"]);
    for (const r of rollen) assert.match(sql, new RegExp(`\\('photos', '${r}'\\)`));
  });

  it("Grenzen im Browser wie im Bucket", () => {
    assert.equal(PHOTO_MAX_BYTES, 15728640);
    assert.equal(pruefeFoto({ size: 10, type: "image/heic" }).ok, false);
    assert.equal(pruefeFoto({ size: PHOTO_MAX_BYTES + 1, type: "image/jpeg" }).ok, false);
  });

  it("die Route prüft das Recht vor dem Signieren", () => {
    const route = read("app/api/admin/fotos/route.ts");
    assert.ok(route.indexOf('rpc("can_manage_event_photos")') < route.indexOf("createSignedUploadUrl"));
  });

  it("not_attended hat Texte", () => {
    assert.equal(toRpcFailure({ code: "42501", message: "not_attended", details: "", hint: "", name: "PostgrestError" } as never).key, "not_attended");
    for (const lang of ["de", "en"]) assert.ok(JSON.parse(read(`lib/i18n/${lang}.json`)).rpc.not_attended, lang);
  });
});
