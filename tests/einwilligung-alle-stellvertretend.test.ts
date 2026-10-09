import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

/**
 * SPK-074-Nachtrag (K-45, K-46): im Verwaltet-Fall bestätigt der Kontakt mit
 * Zugang **alle vier** Einwilligungen stellvertretend — auch Hotel und Shuttle —
 * und sieht dabei die stellvertretende Textfassung „Ich bestätige für <Name>,
 * dass …“ (DE und EN je Text). Der Stand von 0215 (drei Arten) steht in
 * `einwilligung-stellvertretend.test.ts`.
 */
const sql = () => migrationText("v6_einwilligung_alle_stellvertretend");
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

/** Die vier Einwilligungen des Speaker-Portals und ihre Textschlüssel im Wörterbuch. */
const ARTEN = {
  photo_video: "consentPhotoVideo",
  speaker_release: "consentSpeakerRelease",
  slides_publication: "consentSlides",
  hospitality_data: "consentHospitality",
} as const;

function funktion(name: string): string {
  const s = sql();
  const start = s.search(new RegExp(`create (or replace )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} fehlt in der Migration`);
  return s.slice(start, s.indexOf("$$;", s.indexOf("AS $$", start) + 5));
}

describe("SPK-074-Nachtrag: Datenbank", () => {
  it("lässt genau die vier Arten des Speaker-Portals zu, jede andere bleibt abgewiesen", () => {
    const f = funktion("record_speaker_consent_on_behalf");
    assert.match(f, /v_key not in \('photo_video', 'speaker_release', 'slides_publication', 'hospitality_data'\)/);
    assert.match(f, /raise exception 'consent_type_not_allowed' using errcode = '22023', detail = v_key/);
    // erst alles prüfen, dann schreiben: die Prüfschleife steht vor dem ersten insert
    assert.ok(f.indexOf("consent_type_not_allowed") < f.indexOf("insert into consent_record"));
  });

  it("protokolliert die Textfassung neben wer, Kontakt und Profil", () => {
    const f = funktion("record_speaker_consent_on_behalf");
    assert.match(
      f,
      /jsonb_build_object\('by_person_id', v_me, 'contact_id', v_contact, 'profile_id', v_sp\.id, 'wording', 'proxy'\)/,
    );
    assert.match(f, /'stellvertretend'/);
  });

  it("ändert nur diese eine Funktion und lässt die Rechteprüfung, die Versionen und die großen Profilfunktionen in Ruhe", () => {
    const s = sql();
    assert.equal((s.match(/create (or replace )?function /g) ?? []).length, 1);
    const f = funktion("record_speaker_consent_on_behalf");
    // wer bestätigen darf, bleibt `speaker_consent_contact` (Kontakt mit Zugang, Verwaltet-Fall)
    assert.match(f, /v_contact := speaker_consent_contact\(p_profile_id, v_me\);/);
    assert.match(f, /raise exception 'consent_not_managed'/);
    // `version` ist die Fassung der Texte, nicht der Wortlaut: die Abfrage der Speakerin bleibt gleich
    assert.match(f, /btrim\(p_version\)/);
    assert.doesNotMatch(s, /function (my_speaker_profile|speaker_detail|speaker_consent_contact|can_confirm_consent_on_behalf|speaker_consents_admin)\(/);
    assert.match(s.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("SPK-074-Nachtrag: Portal", () => {
  it("es gibt keine Sonderliste „nur diese drei“ mehr, das Profil schickt alle vier", () => {
    const typen = quelle("app/(speaker)/speaker/types.ts");
    assert.doesNotMatch(typen, /SPEAKER_CONSENTS_ON_BEHALF/);
    for (const art of Object.keys(ARTEN)) assert.match(typen, new RegExp(`"${art}"`));
    const form = quelle("app/(speaker)/speaker/profil/EinwilligungenTab.tsx");
    assert.doesNotMatch(form, /SPEAKER_CONSENTS_ON_BEHALF|nurSelbst/);
    assert.match(form, /saveSpeakerConsentsOnBehalf\(profile\.id, consents\)/);
  });

  it("das Profil zeigt dem Kontakt die stellvertretende Fassung mit dem Namen der Speakerin", () => {
    const form = quelle("app/(speaker)/speaker/profil/EinwilligungenTab.tsx");
    assert.match(form, /t\[`\$\{consentLabelKey\(key\)\}OnBehalf`\]\.replaceAll\("\{name\}", speakerName \|\| "—"\)/);
    // jede der vier Arten hat dort einen Textschlüssel
    for (const [art, schluessel] of Object.entries(ARTEN)) {
      assert.match(form, new RegExp(`${art}: "${schluessel}"`));
    }
  });

  it("die Anreise lässt den Kontakt Hotel und Shuttle im Weg zur Buchung bestätigen", () => {
    const view = quelle("app/(speaker)/speaker/travel/TravelView.tsx");
    assert.match(view, /saveSpeakerConsentsOnBehalf\(profileId, \{ hospitality_data: true \}\)/);
    assert.match(view, /\(!isAssistant \|\| consentOnBehalf\)/);
    // die Sackgasse „Nur der Speaker selbst kann das entscheiden“ bleibt der Assistenz ohne Verwaltet-Fall
    assert.match(view, /blockReason === "consent" && isAssistant && !consentOnBehalf/);
    assert.match(view, /t\.consentHospitalityOnBehalf\.replaceAll\("\{name\}", speakerName \|\| "—"\)/);
    const seite = quelle("app/(speaker)/speaker/travel/page.tsx");
    assert.match(seite, /profile\.is_assistant\s+\? await supabase\.rpc\("can_confirm_consent_on_behalf", \{ p_profile_id: profile\.id \}\)/);
    assert.match(seite, /consentOnBehalf=\{stellvertretend === true\}/);
  });

  it("die Übersicht sagt dem Kontakt, dass er Einwilligungen stellvertretend bestätigt", () => {
    const seite = quelle("app/(speaker)/speaker/page.tsx");
    assert.match(seite, /rpc\("can_confirm_consent_on_behalf", \{ p_profile_id: profile\.id \}\)/);
    assert.match(seite, /t\.speaker\.assistantConsentNoteOnBehalf/);
  });
});

describe("SPK-074-Nachtrag: Texte (K-46)", () => {
  for (const sprache of ["de", "en"] as const) {
    it(`${sprache}: jede Einwilligung hat eine stellvertretende Fassung mit dem Namen`, () => {
      const w = woerterbuch(sprache);
      const anfang = sprache === "de" ? "Ich bestätige für {name}, dass " : "I confirm for {name} that ";
      for (const schluessel of Object.values(ARTEN)) {
        const text: string | undefined = w.speaker[`${schluessel}OnBehalf`];
        assert.ok(text, `${sprache}.speaker.${schluessel}OnBehalf fehlt`);
        assert.ok(text.startsWith(anfang), `${sprache}.speaker.${schluessel}OnBehalf beginnt nicht mit „${anfang}“`);
        // die Ich-Fassung bleibt für die Speakerin selbst unverändert da
        assert.ok(w.speaker[schluessel], `${sprache}.speaker.${schluessel} fehlt`);
      }
      assert.ok(w.speaker.assistantConsentNoteOnBehalf, `${sprache}.speaker.assistantConsentNoteOnBehalf fehlt`);
    });

    it(`${sprache}: Admin-Hinweis und Fehlermeldung sagen nicht mehr, Hotel und Shuttle gehe nur selbst`, () => {
      const w = woerterbuch(sprache);
      assert.doesNotMatch(w.adminSpeaker.consentsHint, /außer Hotel|except hotel/i);
      assert.doesNotMatch(w.rpc.consent_type_not_allowed, /nur der Speaker|only the speaker/i);
    });
  }
});

describe("SPK-074-Nachtrag: Testdaten für Konrads Konto", () => {
  it("der verwaltete TEST-Speaker hat Hotel-Anspruch, damit die Buchung die Einwilligung abfragt", () => {
    const s = quelle("scripts/testdaten-konrad.mjs");
    const start = s.indexOf("async function verwalteterSpeaker");
    assert.ok(start >= 0, "verwalteterSpeaker fehlt");
    const ende = s.indexOf("\nasync function ", start + 10);
    assert.match(s.slice(start, ende), /hospitality_status: "eligible"/);
  });
});
