import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { needsPartnerShare, PARTNER_SHARE_FORMATS, PARTNER_SHARE_VERSION } from "@/lib/consent";
import { toRpcFailure } from "@/lib/rpc-error";
import { migrationText } from "@/tests/migration-datei";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Weitergabe an Partner (PART-129, K-78 Weg B)", () => {
  const sql = migrationText("v6_weitergabe_partner");

  it("die Formatregel steht in Datenbank und Oberfläche gleich", () => {
    const fn = sql.slice(sql.indexOf("create or replace function session_needs_partner_share"), sql.indexOf("drop function"));
    for (const f of PARTNER_SHARE_FORMATS) assert.match(fn, new RegExp(`'${f}'`));
    assert.match(fn, /access_mode = 'application'/);
    assert.equal(needsPartnerShare("masterclass", "application"), true);
    assert.equal(needsPartnerShare("company_tour", "application"), true);
    assert.equal(needsPartnerShare("masterclass", "registration"), false);
    assert.equal(needsPartnerShare("talk", "application"), false);
    assert.equal(needsPartnerShare(null, null), false);
  });

  it("apply_to_session verlangt den Haken, schreibt den Nachweis und die alte Signatur ist weg", () => {
    assert.match(sql, /drop function if exists apply_to_session\(uuid, jsonb, boolean\)/);
    const fn = sql.slice(sql.indexOf("create or replace function apply_to_session"), sql.indexOf("create or replace function release_application_share"));
    assert.match(fn, /session_needs_partner_share\(p_session_id\) and not coalesce\(p_consent_share, false\)/);
    assert.match(fn, /raise exception 'consent_share_required' using errcode = 'P0001'/);
    assert.match(fn, /'share_with_partner', v_version, true, 'portal'/);
    assert.match(fn, /\^partner_share_\[0-9\]\{4\}-\[0-9\]\+\$/);
    assert.equal(PARTNER_SHARE_VERSION, "partner_share_2027-1");
    assert.match(fn, /'partner_share_2027-1'/);
  });

  it("Nachholen und Widerruf nur für die eigene Bewerbung, Audit ohne Adresse, anon ohne Zugriff", () => {
    for (const name of ["release_application_share", "revoke_application_share"]) {
      const start = sql.indexOf(`create or replace function ${name}`);
      const body = sql.slice(start, sql.indexOf("end $$;", start));
      assert.match(body, /a\.person_id = v_pid/);
      assert.match(body, /application_not_found/);
      assert.match(body, /log_audit\('application\.share_(release|revoke)'/);
      assert.doesNotMatch(body.replace(/--.*$/gm, ""), /email/i);
    }
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("die Bewerbungsmaske hat den Pflichthaken, nicht vorangekreuzt, mit Link auf den Langtext", () => {
    const v = read("app/(talent)/programm/ProgrammeView.tsx");
    assert.match(v, /useState\(false\)/);
    assert.match(v, /needsPartnerShare\(session\.format, session\.access_mode\)/);
    assert.match(v, /\(pflicht && !consentShare\)/);
    assert.match(v, /href="\/weitergabe"/);
  });

  it("Meine Bewerbungen bietet Freigeben und Widerrufen, die Seite /weitergabe steht", () => {
    const m = read("app/(talent)/meine/MeineView.tsx");
    assert.match(m, /releaseApplicationShare/);
    assert.match(m, /revokeApplicationShare/);
    assert.match(read("app/(talent)/actions.ts"), /rpc\("release_application_share"/);
    assert.match(read("app/(talent)/weitergabe/page.tsx"), /talentShare/);
  });

  it("Fehlerschlüssel und Texte in beiden Sprachen; der Kurztext nennt E-Mail und einmalige Kontaktaufnahme", () => {
    assert.equal(toRpcFailure({ code: "P0001", message: "consent_share_required", details: "", hint: "", name: "PostgrestError" } as never).key, "consent_share_required");
    for (const lang of ["de", "en"]) {
      const j = JSON.parse(read(`lib/i18n/${lang}.json`));
      assert.ok(j.rpc.consent_share_required, lang);
      assert.ok(j.talentShare.controller.includes("Be Brave gUG"), lang);
      for (const k of ["title", "lead", "data1", "purpose", "basis", "withdraw"]) assert.ok(j.talentShare[k], `${lang}:${k}`);
      assert.match(j.programme.consentSharePflicht, lang === "de" ? /E-Mail-Adresse[\s\S]*einmalig/ : /email address[\s\S]*once/);
      for (const k of ["shareRelease", "shareRevoke", "shareMissing"]) assert.ok(j.participation[k], `${lang}:${k}`);
    }
  });
});
