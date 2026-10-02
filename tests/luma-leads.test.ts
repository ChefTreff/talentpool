import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Luma-Gäste als Lead (K-34)", () => {
  const sql = migrationText("v6_luma_leads");
  const fn = sql.slice(sql.indexOf("create or replace function luma_sync_registration"), sql.indexOf("create or replace function luma_lead_stats"));

  it("bleibt nur für den Server, die alte Signatur ist gedroppt", () => {
    assert.match(sql, /drop function if exists luma_sync_registration\(text, text, text, text, timestamptz, boolean\)/);
    assert.match(fn, /if auth\.uid\(\) is not null then raise exception 'not allowed' using errcode = '42501'/);
    assert.match(sql, /revoke execute on function luma_sync_registration\([^)]*\) from public, anon, authenticated/);
  });

  it("legt einen Lead nur für Anmeldungen an, nie für eingeladen, abgesagt oder gesperrt", () => {
    assert.match(fn, /v_status in \('confirmed', 'applied', 'waitlisted', 'attended'\)/);
    assert.match(fn, /not is_suppressed\(v_email\)/);
    assert.match(fn, /'luma', 'lead'/);
  });

  it("schreibt nur Name, E-Mail und Teilnahme — keine Einwilligung", () => {
    assert.doesNotMatch(fn.replace(/--.*$/gm, ""), /consent_record|person_interest|phone|birthdate/);
    assert.match(fn, /insert into person \(first_name, last_name, source_first, tier\)/);
    assert.match(fn, /insert into person_email \(person_id, email, is_primary, verified\) values \(v_person, v_email, true, false\)/);
  });

  it("luma_lead_stats liefert nur Zahlen und prüft den Abschnitt", () => {
    const stats = sql.slice(sql.indexOf("create or replace function luma_lead_stats"));
    assert.match(stats, /RETURNS TABLE\(total integer, without_login integer, claimed integer\)/);
    assert.match(stats, /can_view_community_events\(\)/);
    assert.doesNotMatch(stats, /first_name|last_name|email/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("der Sync übergibt die Namen und die Admin-Seite zeigt die Zählwerte", () => {
    assert.match(read("lib/luma/sync.ts"), /p_first_name: p\.firstName/);
    assert.match(read("app/(admin)/admin/community-events/page.tsx"), /luma_lead_stats/);
    for (const lang of ["de", "en"]) {
      const j = JSON.parse(read(`lib/i18n/${lang}.json`));
      for (const k of ["leadsTitle", "leadsBody", "leadsHint"]) assert.ok(j.communityEventsAdmin[k], `${lang}:${k}`);
    }
  });

  it("die Verarbeitung ist in der Datenschutz-Doku geführt", () => {
    assert.match(read("docs/datenschutz-verarbeitungen.md"), /\| V15 \| \*\*Luma-Lead\*\*/);
  });
});
