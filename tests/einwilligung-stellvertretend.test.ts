import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

/**
 * SPK-074 (K-40): im Verwaltet-Fall bestätigt der Kontakt mit Zugang Foto,
 * Veröffentlichung und Folien stellvertretend — protokolliert, im Admin mit
 * Namen, im Portal als stellvertretend benannt. Das ist der Stand von 0215;
 * Hotel und Shuttle sowie die stellvertretende Textfassung kamen mit dem
 * Nachtrag (K-45, K-46) und stehen in `einwilligung-alle-stellvertretend.test.ts`.
 */
const sql = () => migrationText("v6_einwilligung_stellvertretend");
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

function funktion(name: string): string {
  const s = sql();
  const start = s.search(new RegExp(`create (or replace )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} fehlt in der Migration`);
  return s.slice(start, s.indexOf("$$;", s.indexOf("AS $$", start) + 5));
}

describe("SPK-074: Datenbank", () => {
  it("nur im Verwaltet-Fall, nur der Kontakt mit Zugang, nie die Speakerin selbst", () => {
    const f = funktion("speaker_consent_contact");
    assert.match(f, /sp\.mail_via_contact_id is not null/);
    assert.match(f, /c\.has_access/);
    assert.match(f, /c\.person_id <> sp\.person_id/);
    assert.match(sql(), /revoke execute on function speaker_consent_contact\(uuid, uuid\) from public, anon, authenticated;/);
  });

  it("0215 schreibt nur die drei Arten, mit Quelle und Protokoll (die vierte kam mit dem Nachtrag)", () => {
    const f = funktion("record_speaker_consent_on_behalf");
    assert.match(f, /v_key not in \('photo_video', 'speaker_release', 'slides_publication'\)/);
    assert.match(f, /raise exception 'consent_type_not_allowed'/);
    assert.match(f, /raise exception 'consent_not_managed'/);
    assert.match(f, /'stellvertretend'/);
    assert.match(f, /jsonb_build_object\('by_person_id', v_me, 'contact_id', v_contact, 'profile_id', v_sp\.id\)/);
  });

  it("das Team liest den Stand mit Namen, sonst niemand", () => {
    const f = funktion("speaker_consents_admin");
    assert.match(f, /is_speaker_team\(v_sp\.edition_id\)/);
    assert.match(f, /x\.meta->>'by_person_id'/);
  });

  it("ändert keine der großen Profilfunktionen (parallele Vorschläge)", () => {
    assert.doesNotMatch(sql(), /function (my_speaker_profile|speaker_detail)\(/);
    assert.match(sql().trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("SPK-074: Portal und Admin", () => {
  it("das Portal öffnet den Block stellvertretend und schickt über die RPC", () => {
    const seite = quelle("app/(speaker)/speaker/profil/page.tsx");
    assert.match(seite, /rpc\("can_confirm_consent_on_behalf", \{ p_profile_id: profile\.id \}\)/);
    const form = quelle("app/(speaker)/speaker/profil/EinwilligungenTab.tsx");
    assert.match(form, /const readOnlyConsent = profile\.is_assistant && !consentOnBehalf;/);
    assert.match(form, /t\.consentOnBehalf\.replace\("\{name\}"/);
    const aktion = quelle("app/(speaker)/speaker/actions.ts");
    assert.match(aktion, /rpc\("record_speaker_consent_on_behalf"/);
  });

  it("das Admin-Detail zeigt, wer stellvertretend bestätigt hat", () => {
    assert.match(quelle("app/(admin)/admin/speaker/[id]/page.tsx"), /rpc\("speaker_consents_admin", \{ p_profile_id: id \}\)/);
    assert.match(quelle("app/(admin)/admin/speaker/[id]/Detail.tsx"), /t\.consentGrantedByProxy : t\.consentNotGivenByProxy/);
  });

  it("die Texte stehen in DE und EN, die Fehlerschlüssel sind bekannt", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache);
      assert.ok(w.speaker.consentOnBehalf?.includes("{name}"), `${sprache}.speaker.consentOnBehalf fehlt`);
      assert.ok(w.speaker.consentOnBehalfSave, `${sprache}.speaker.consentOnBehalfSave fehlt`);
      for (const k of ["consentsTitle", "consentGranted", "consentGrantedByProxy", "consentNotGiven", "consentNotGivenByProxy", "consentNone"]) {
        assert.ok(w.adminSpeaker[k], `${sprache}.adminSpeaker.${k} fehlt`);
      }
      for (const k of ["consent_not_managed", "consent_type_not_allowed", "invalid_consents"]) {
        assert.ok(w.rpc[k], `${sprache}.rpc.${k} fehlt`);
      }
    }
    const fehler = quelle("lib/rpc-error.ts");
    for (const k of ["consent_not_managed", "consent_type_not_allowed", "invalid_consents"]) assert.match(fehler, new RegExp(`"${k}"`));
  });
});
