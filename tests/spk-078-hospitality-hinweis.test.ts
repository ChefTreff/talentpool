import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { SPEAKER_CONSENTS } from "@/app/(speaker)/speaker/types";

/**
 * SPK-078 (K-56, Konrad 08.10.2026): **keine eigene Einwilligung** für die Ernährungsangaben der Speaker (Art. 9) — statt dessen ein Hinweis
 * bei den Hospitality-Daten mit Zweck, Freiwilligkeit und Löschung nach der Edition. Der Hinweis steht an der Einwilligung „Hotel und Shuttle“
 * (Pflichtdialog beim ersten Anmelden, Profil, Buchungsdialog) und an der Ernährungskarte. Hier steht, was ohne Browser feststeht: die Texte,
 * dass die genannte Frist die der Löschfunktion ist, wo der Hinweis steht — und dass dabei weder der Einwilligungstext noch die Liste der
 * Einwilligungen angefasst wurde.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

const GATE = "app/(speaker)/EinwilligungsGate.tsx";
const LAYOUT = "app/(speaker)/layout.tsx";
const PROFIL = "app/(speaker)/speaker/profil/SpeakerProfileForm.tsx";
const REISE = "app/(speaker)/speaker/travel/TravelView.tsx";

describe("SPK-078: die Texte", () => {
  it("der Hinweis nennt Zweck (Catering), Freiwilligkeit und Löschung — deutsch und englisch", () => {
    const de: string = woerterbuch("de").speaker.consentHospitalityHint;
    const en: string = woerterbuch("en").speaker.consentHospitalityHint;
    assert.match(de, /Ernährung/);
    assert.match(de, /freiwillig/);
    assert.match(de, /nur für das Catering/);
    assert.match(de, /gelöscht \d+ Tage nach dem Ende des Summits/);
    assert.match(en, /diet or intolerances/);
    assert.match(en, /voluntary/);
    assert.match(en, /only for catering/);
    assert.match(en, /deleted \d+ days after the end of the summit/);
  });

  it("die Ernährungskarte sagt es auch: der Löschsatz steht hinter den beiden Sätzen, die schon da waren", () => {
    const de: string = woerterbuch("de").diet.privacy;
    const en: string = woerterbuch("en").diet.privacy;
    assert.match(de, /ohne euren Namen\. Sie erscheinen in keiner Teilnehmerliste\. Wir löschen sie \d+ Tage nach dem Ende des Summits\.$/);
    assert.match(en, /without your name\. They never appear in any attendee list\. We delete them \d+ days after the end of the summit\.$/);
    // Zweck und Freiwilligkeit stehen weiter am Anfang der Karte
    assert.match(woerterbuch("de").diet.body, /freiwillig/);
    assert.match(woerterbuch("de").diet.body, /Catering/);
  });

  it("die genannte Frist ist die der Löschfunktion: `purge_diet_data` löscht nach genau so vielen Tagen, und das Housekeeping ruft sie auf", () => {
    const funktion = migrationText("v5_catering").match(/create or replace function purge_diet_data\(p_days integer default (\d+)\)/);
    assert.ok(funktion, "purge_diet_data(p_days integer default N) fehlt in der Migration");
    const tage = funktion[1];
    for (const text of [
      woerterbuch("de").speaker.consentHospitalityHint,
      woerterbuch("de").diet.privacy,
      woerterbuch("en").speaker.consentHospitalityHint,
      woerterbuch("en").diet.privacy,
    ] as string[]) {
      assert.match(text, new RegExp(`\\b${tage} (Tage|days)\\b`), `„${text}“ nennt nicht ${tage} Tage`);
    }
    assert.match(quelle("supabase/snapshot/functions/run_application_housekeeping.sql"), /v_diet := purge_diet_data\(\);/);
  });

  it("der Einwilligungstext selbst bleibt, wie er war — der Hinweis ist kein Teil davon", () => {
    assert.equal(woerterbuch("de").speaker.consentHospitality, "Meine Daten dürfen für Hotel und Shuttle verwendet werden");
    assert.equal(woerterbuch("de").speaker.consentHospitalityOnBehalf, "Ich bestätige für {name}, dass die Daten für Hotel und Shuttle verwendet werden dürfen.");
    assert.equal(woerterbuch("en").speaker.consentHospitality, "My data may be used for hotel and shuttle");
    assert.equal(woerterbuch("en").speaker.consentHospitalityOnBehalf, "I confirm for {name} that the data for hotel and shuttle may be used.");
  });

  it("es gibt keine neue Einwilligung: die vier Arten sind dieselben, und nirgends steht eine eigene für die Ernährung", () => {
    assert.deepEqual([...SPEAKER_CONSENTS], ["photo_video", "speaker_release", "slides_publication", "hospitality_data"]);
    for (const datei of [GATE, LAYOUT, PROFIL, REISE, "app/(speaker)/speaker/types.ts"]) {
      assert.doesNotMatch(quelle(datei), /diet_consent|dietary_data|consentDiet/, datei);
    }
  });
});

describe("SPK-078: wo der Hinweis steht", () => {
  it("im Pflichtdialog beim ersten Anmelden — als Hinweis unter dem Text von „Hotel und Shuttle“, nur dort", () => {
    const gate = quelle(GATE);
    assert.match(gate, /keys: \{ key: string; label: string; hint\?: string \}\[\];/);
    assert.match(gate, /\{k\.label\}\s+\{k\.hint && <span className="mt-1 block ct-help">\{k\.hint\}<\/span>\}/);
    assert.match(quelle(LAYOUT), /hint: key === "hospitality_data" \? t\.speaker\.consentHospitalityHint : undefined,/);
  });

  it("im Profil unter dem Haken „Hotel und Shuttle“ — auch in der stellvertretenden Fassung, bei keinem anderen Haken", () => {
    const profil = quelle(PROFIL);
    const schleife = profil.slice(profil.indexOf("SPEAKER_CONSENTS.map((key) => ("), profil.indexOf("</label>", profil.indexOf("SPEAKER_CONSENTS.map((key) => (")));
    assert.match(schleife, /\{key === "hospitality_data" && <span className="mt-1 block ct-help">\{t\.consentHospitalityHint\}<\/span>\}/);
    assert.equal((schleife.match(/consentHospitalityHint/g) ?? []).length, 1);
    // der Hinweis steht hinter beiden Fassungen des Textes, nicht in einer davon
    assert.ok(schleife.indexOf("consentHospitalityHint") > schleife.indexOf("t[consentLabelKey(key)]"));
  });

  it("im Buchungsdialog am Weg zur Einwilligung und in der Karte für die Assistenz, die nicht einwilligen darf", () => {
    const reise = quelle(REISE);
    assert.match(reise, /<p className="ct-label">\{label\(askConsent\)\}<\/p>\s+\{\/\*[\s\S]*?\*\/\}\s+<p className="ct-help mt-3">\{t\.consentHospitalityHint\}<\/p>/);
    assert.match(reise, /<p className="ct-help">\{t\.consentHospitality\}<\/p>\s+<p className="ct-help mt-2">\{t\.consentHospitalityHint\}<\/p>\s+<p className="ct-help mt-3">\{t\.consentReadOnly\}<\/p>/);
    // der stellvertretende Text im Dialog bleibt unverändert
    assert.match(reise, /t\.consentHospitalityOnBehalf\.replaceAll\("\{name\}", speakerName \|\| "—"\)/);
  });

  it("die Ernährungskarte selbst ist unverändert — sie zeigt den (erweiterten) Datenschutzsatz", () => {
    const karte = quelle("components/diet/DietCard.tsx");
    assert.match(karte, /<p className="ct-help mt-3">\{t\.privacy\}<\/p>/);
  });
});

describe("SPK-078: Datenschutzverzeichnis und Backlog", () => {
  const verzeichnis = () => quelle("docs/datenschutz-verarbeitungen.md");

  it("V4 nennt die Entscheidung K-56 und die Löschfunktion", () => {
    const v4 = verzeichnis().split("\n").find((z) => z.startsWith("| V4 |")) ?? "";
    assert.match(v4, /\*\*keine eigene Einwilligung für die Ernährung\*\* — Entscheidung K-56, Konrad 08\.10\.2026/);
    assert.match(v4, /\*\*Ernährungsangaben löscht `purge_diet_data\(\)` 30 Tage nach dem Ende der Edition\*\*/);
  });

  it("Nr. 3 und Nr. 7 der offenen Punkte sind entschieden statt „zu klären“", () => {
    const text = verzeichnis();
    assert.ok(/3\. Art\.-9-Daten[^\n]*\*\*Entschieden \(K-56, Konrad 08\.10\.2026, SPK-078\):\*\* keine eigene Einwilligung für die Ernährung/.test(text), "Nr. 3 ist nicht entschieden");
    assert.ok(/7\. \*\*Stellvertretende Einwilligungen[^\n]*\*\*Art\. 9 — entschieden \(K-56, Konrad 08\.10\.2026, SPK-078\):\*\*/.test(text), "Nr. 7 ist nicht entschieden");
    assert.ok(!/\*\*Zu klären \(Art\. 9\):\*\* `hospitality_data`/.test(text), "„Zu klären (Art. 9)“ steht noch da");
  });

  it("der Testleitfaden nennt den Hinweis im Profil, an der Ernährungskarte und im Buchungsdialog", () => {
    const leitfaden = quelle("docs/team-testleitfaden.md");
    assert.ok(/`\/speaker\/profil` Profil \|[^\n]*Hinweis zur Ernährung\*\* \(SPK-078, K-56/.test(leitfaden), "Zeile /speaker/profil");
    assert.ok(/`\/speaker\/travel` Anreise \|[^\n]*demselben Hinweis zur Ernährung wie im Profil \(SPK-078\)/.test(leitfaden), "Zeile /speaker/travel");
  });

  it("die Backlog-Zeile SPK-078 trägt die PR-Nummer", () => {
    assert.ok(/\| SPK-078 \|[^\n]*\| P3 \|[^\n]*(geplant|gebaut|abgenommen) #\d+/.test(quelle("docs/feedback/speaker.md")), "SPK-078 trägt keine PR-Nummer");
  });
});
