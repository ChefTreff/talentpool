import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

/**
 * Befund Speaker-Chat 05.10.2026 (ADM-072), Entscheidung Plan: Der Abschnitt „Hotels“ steht für Bereichslead
 * Speaker und Programm-Team offen, die Funktionen dahinter prüften `is_staff()` (= nur admin). Die Datenbank-
 * Seite belegt `supabase/tests/v6_hotel_freigabe_rechte.sql` mit echtem Rollenwechsel; hier steht, was sich ohne
 * Datenbank festhalten lässt.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");

describe("Hotel-Freigaben für das Speaker-Team: Migration", () => {
  const sql = () => migrationText("v6_hotel_freigabe_rechte");

  it("stellt Übersicht, Bestätigen und Ablehnen auf das Speaker-Team um", () => {
    const c = code(sql());
    for (const f of ["hospitality_admin_overview", "confirm_hospitality", "decline_hospitality"]) {
      assert.match(c, new RegExp(`create or replace function ${f}\\(`), `${f} fehlt`);
    }
    // Jede Prüfung ist coalesce-gesichert: ein NULL aus einer OR-Kette würde `if not NULL` überspringen.
    const tore = c.match(/if not coalesce\(is_speaker_team\([a-z_]+\), false\) then raise exception 'not allowed' using errcode = '42501'/g) ?? [];
    assert.equal(tore.length, 3, "drei Tore, je Funktion eins");
    assert.doesNotMatch(c, /is_staff\(\)/, "kein is_staff() mehr in den umgestellten Funktionen");
  });

  it("das Kontingent bleibt bei admin: Pflege und Stornierung werden nicht angefasst", () => {
    const c = code(sql());
    // `upsert_hospitality_quota` bleibt `is_staff()` — Kontingente sind die Kooperation mit dem Hotel.
    assert.doesNotMatch(c, /create or replace function upsert_hospitality_quota/);
    // `cancel_hospitality` storniert das Team schon heute über `can_manage_speaker(…)`.
    assert.doesNotMatch(c, /create or replace function cancel_hospitality/);
  });

  it("nimmt programme_team aus dem Abschnitt expenses und endet mit harden_definer_functions", () => {
    const c = code(sql());
    assert.match(c, /delete from admin_section_role where section = 'expenses' and role = 'programme_team';/);
    assert.match(c.trim(), /select harden_definer_functions\(\);$/);
    // Die Funktionen stehen vor der Härtung, nicht dahinter.
    assert.ok(c.indexOf("create or replace function decline_hospitality") < c.indexOf("harden_definer_functions"));
  });
});

describe("Hotels im Admin: Kontingent nur für admin", () => {
  it("die Seite gibt canEditQuota aus der Rolle admin weiter", () => {
    const seite = quelle("app/(admin)/admin/hospitality/page.tsx");
    assert.match(seite, /const \{ roleNames \} = await requireAdminSection\("hospitality"/);
    assert.match(seite, /const canEditQuota = roleNames\.includes\("admin"\);/);
    assert.match(seite, /<HospitalityAdmin\s+canEditQuota=\{canEditQuota\}/);
  });

  it("ohne canEditQuota fehlen Kapazität, Speichern und Aktivieren — es steht der erklärende Satz da", () => {
    const k = quelle("app/(admin)/admin/hospitality/HospitalityAdmin.tsx");
    assert.match(k, /\{!canEditQuota && <p className="ct-help">\{t\.quotaAdminOnly\}<\/p>\}/);
    // Die Steuerung hängt als Ganzes an canEditQuota.
    const steuerung = k.slice(k.indexOf("{canEditQuota && ("));
    assert.match(steuerung.slice(0, 1400), /cap-\$\{q\.quota_id\}/);
    assert.match(steuerung.slice(0, 1800), /onActive\(q\)/);
  });

  it("der Hinweis steht in DE und EN", () => {
    for (const sprache of ["de", "en"]) {
      const w = JSON.parse(quelle(`lib/i18n/${sprache}.json`));
      assert.ok(w.admin.hospitality.quotaAdminOnly, `${sprache}.admin.hospitality.quotaAdminOnly fehlt`);
    }
  });
});

describe("Reisekosten: Geld nur über die Bereichsleitung", () => {
  it("die Registry nennt für expenses nur area_lead_speaker", () => {
    const r = quelle("lib/admin-sections.ts");
    assert.match(r, /key: "expenses", path: "\/admin\/reisekosten", roles: \["area_lead_speaker"\]/);
  });
});
