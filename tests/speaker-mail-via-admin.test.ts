import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { toRpcFailure } from "@/lib/rpc-error";
import { migrationText } from "@/tests/migration-datei";

/**
 * Kommunikation über einen Kontakt im Speaker-Admin (SPK-072, PART-091): das
 * Team setzt und löst die Umleitung der Speaker-Mails, mit Audit-Eintrag.
 */
const sql = () => migrationText("v6_speaker_mail_via_admin");
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

describe("SPK-072: Datenbank", () => {
  it("nur das Speaker-Team der Edition, nur Kontakte des Profils mit Zugang, mit Audit", () => {
    const s = sql();
    assert.ok(s.includes("create or replace function set_speaker_mail_via(p_profile_id uuid, p_contact_id uuid)"));
    assert.match(s, /if not is_speaker_team\(v_sp\.edition_id\) then raise exception 'not allowed' using errcode = '42501'/);
    assert.match(s, /where c\.id = p_contact_id and c\.profile_id = p_profile_id/);
    assert.match(s, /if not v_c\.has_access or v_c\.person_id is null then\s+raise exception 'contact_without_access' using errcode = 'P0001'/);
    assert.match(s, /perform log_audit\('speaker\.mail_via', 'speaker_profile'/);
    assert.match(s.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("SPK-072: Admin", () => {
  it("die Aktion ruft die RPC mit ihren Parameternamen", () => {
    const a = quelle("app/(admin)/admin/speaker/actions.ts");
    assert.match(a, /rpc\("set_speaker_mail_via", \{\s+p_profile_id: profileId,\s+p_contact_id: contactId,\s+\}\)/);
  });

  it("das Detail bietet nur Kontakte mit Zugang an und kann aufheben", () => {
    const d = quelle("app/(admin)/admin/speaker/[id]/Detail.tsx");
    assert.match(d, /filter\(\(k\) => k\.has_access\)/);
    assert.match(d, /\{ value: "", label: t\.mailViaSelf \}/);
    assert.match(d, /setMailVia\(speaker\.id, mailVia \|\| null\)/);
    // Ein eingetragener Kontakt ohne Zugang bleibt wählbar — sonst ließe sich nicht aufheben.
    assert.match(d, /speaker\.mail_via && !speaker\.mail_via\.has_access/);
  });

  it("contact_without_access kommt als eigene Meldung an, die Texte stehen in DE und EN", () => {
    const res = toRpcFailure({ code: "P0001", message: "contact_without_access", details: "", hint: "", name: "PostgrestError" } as Parameters<
      typeof toRpcFailure
    >[0]);
    assert.equal(res.key, "contact_without_access");
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache);
      assert.ok(w.rpc.contact_without_access, `${sprache}.rpc fehlt`);
      for (const k of ["mailViaLabel", "mailViaHint", "mailViaSelf", "mailViaApply", "mailViaSaved", "mailViaNoAccessOption"]) {
        assert.ok(w.adminSpeaker[k], `${sprache}.adminSpeaker.${k} fehlt`);
      }
    }
  });
});
