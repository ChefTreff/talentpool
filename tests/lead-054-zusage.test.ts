import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  STAENDE_VOR_ZUSAGE,
  istNachZusage,
  kannZusageMelden,
  naechstePflichten,
} from "@/app/(speaker-leads)/speaker-leads/phase";
import { PIPELINE_BESTAETIGT, PIPELINE_ORDER } from "@/app/(speaker-leads)/speaker-leads/types";

/**
 * LEAD-054 (Paulina 05.10.): „der Schritt ‚hat bestätigt‘ fehlt“. Vor der Zusage
 * stehen im Fenster nur Grunddaten, Ansprache und Einordnung; mit „Hat
 * bestätigt“ öffnen sich Onboarding, Hospitality und Programm, und das Fenster
 * nennt die nächsten Pflichten.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

type Zeile = Parameters<typeof naechstePflichten>[0];
const zeile = (x: Partial<Zeile> = {}): Zeile => ({
  pipeline_status: "confirmed",
  stage_guest: false,
  invited_at: null,
  hospitality_status: "none",
  travel_costs_covered: false,
  travel_costs_approved: false,
  sessions: [],
  ...x,
});

describe("LEAD-054: vor und nach der Zusage", () => {
  it("die Stände nach der Zusage sind dieselben wie `speaker_is_confirmed()` in der Datenbank", () => {
    const sql = quelle("supabase/snapshot/functions/speaker_is_confirmed.sql");
    const inDb = [...(sql.match(/in \(([^)]*)\)/)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    assert.ok(inDb.length >= 5, "Liste in der Datenbank nicht gefunden");
    assert.deepEqual([...PIPELINE_BESTAETIGT].sort(), [...inDb].sort());
    for (const s of PIPELINE_ORDER) assert.equal(istNachZusage(s), inDb.includes(s), s);
  });

  it("vor der Zusage stehen nur Lead, Kontaktiert, die Zusage selbst und die Absage zur Wahl", () => {
    assert.deepEqual(STAENDE_VOR_ZUSAGE, ["lead", "contacted", "confirmed", "declined"]);
    for (const s of ["onboarded", "ready", "published", "attended"]) {
      assert.ok(!STAENDE_VOR_ZUSAGE.includes(s), `${s} gibt es erst nach der Zusage`);
    }
    // jeder gemeldete Stand ist ein bekannter Stand der Pipeline
    for (const s of STAENDE_VOR_ZUSAGE) assert.ok(PIPELINE_ORDER.includes(s));
  });

  it("eine Zusage lässt sich nur aus Lead und Kontaktiert melden", () => {
    assert.equal(kannZusageMelden("lead"), true);
    assert.equal(kannZusageMelden("contacted"), true);
    for (const s of ["confirmed", "onboarded", "ready", "published", "attended", "declined"]) {
      assert.equal(kannZusageMelden(s), false, s);
    }
  });

  it("Pflichten gibt es erst nach der Zusage und nie für Gäste der Partner", () => {
    for (const s of ["lead", "contacted", "declined"]) {
      assert.deepEqual(naechstePflichten(zeile({ pipeline_status: s })), [], s);
    }
    assert.deepEqual(naechstePflichten(zeile({ stage_guest: true })), []);
  });

  it("nach der Zusage nennt das Fenster, was fehlt — in der Reihenfolge, in der man es tut", () => {
    const alles = zeile({ travel_costs_covered: true });
    assert.deepEqual(naechstePflichten(alles), ["invite", "hospitality", "travel", "session"]);
    // Einladung raus → fällt weg
    assert.deepEqual(naechstePflichten({ ...alles, invited_at: "2026-10-05T09:00:00Z" }), [
      "hospitality",
      "travel",
      "session",
    ]);
    // Hospitality freigeschaltet, Reisekosten freigegeben, Session im Programm → nichts offen
    assert.deepEqual(
      naechstePflichten(
        zeile({
          invited_at: "2026-10-05T09:00:00Z",
          hospitality_status: "eligible",
          travel_costs_covered: true,
          travel_costs_approved: true,
          sessions: [{ session_id: "s" } as never],
        }),
      ),
      [],
    );
    // Reisekosten nicht vorgesehen → keine Pflicht dazu
    assert.ok(!naechstePflichten(zeile({ travel_costs_covered: false })).includes("travel"));
  });
});

describe("LEAD-054: Oberfläche", () => {
  const fenster = () => quelle("app/(speaker-leads)/speaker-leads/SpeakerFenster.tsx");
  const liste = () => quelle("app/(speaker-leads)/speaker-leads/PipelineView.tsx");
  // Der Kopf mit Hauptaktion, Menü und „Als Nächstes“ steht seit LEAD-055 Teil 2 einmal für Fenster und Admin-Detail.
  const kopf = () => quelle("components/speaker/SpeakerKopf.tsx");

  // LEAD-055 hat das Fenster umgebaut (Kopf mit einer Hauptaktion, fünf Blöcke): was LEAD-054 zusagt, gilt weiter, steht aber
  // an neuer Stelle — die Zusage ist die Hauptaktion des Kopfes, die Stände ändert „Stand ändern …“, die drei Blöcke nach der
  // Zusage haben ihre Bedingung, die Pflichten stehen als Marken und als „Als Nächstes“ (`tests/lead-055-fenster.test.ts`).
  it("das Fenster zeigt vor der Zusage nur die Stände bis zur Zusage und meldet sie mit einer Aktion", () => {
    assert.match(fenster(), /const nachZusage = warNachZusage\(speaker\);/);
    const k = kopf();
    // „Stand ändern …“: nur die Stände der Phase
    assert.match(k, /\(nachZusage \|\| STAENDE_VOR_ZUSAGE\.includes\(s\)\)/);
    // die Zusage ist die Hauptaktion — hier die Meldung, mit dem Namen im Toast
    assert.match(k, /aktionen\.setPipeline\("confirmed"\), t\.confirmedMoved\.replace\("\{name\}", name\)/);
    assert.match(k, /kannZusageMelden\(speaker\.pipeline_status\) && <p className="ct-help mt-2">\{t\.pipelineLockedHint\}<\/p>/);
    // vor der Zusage heisst der Schritt „Hat bestätigt“, danach wieder wie im Vokabular
    assert.match(k, /s === "confirmed" && !nachZusage \? t\.confirmAction/);
  });

  it("Onboarding, Hospitality und Programm stehen erst nach der Zusage im Fenster", () => {
    const f = fenster();
    assert.match(f, /\{nachZusage && !gast && \(\s+<Block\s+id="fenster-onboarding"/);
    assert.match(f, /\{nachZusage && !gast && \(\s+<Block\s+id="fenster-hospitality"/);
    assert.match(f, /\{nachZusage && \(\s+<Block\s+id="fenster-programm"/);
    // der Haken „Reisekosten vorgesehen“ und die Team-Felder gehören zu Hospitality; das Reception-Kennzeichen ist mit den Side Events
    // (ADM-077) entfallen — die Einladung ersetzt es
    const hospitality = f.slice(f.indexOf('id="fenster-hospitality"'), f.indexOf('id="fenster-programm"'));
    assert.ok(hospitality.includes("draft.travel_costs_covered"));
    assert.ok(!f.includes("draft.reception_eligible"), "kein Reception-Kennzeichen mehr im Fenster");
    assert.match(hospitality, /\{isTeam \? \(/);
    assert.ok(hospitality.indexOf("draft.pass_type") > hospitality.indexOf("{isTeam ? ("), "Team-Felder nur für das Team");
    // Grunddaten und Pipeline stehen immer da (kein Block vor ihnen bedingt)
    assert.match(f, /<Block id="fenster-grunddaten"/);
    assert.match(f, /<Block id="fenster-pipeline"/);
    // Einladung: nur nach der Zusage und nie für Gäste (`invite_speaker` weist sie ab)
    const onboarding = f.slice(f.indexOf('id="fenster-onboarding"'), f.indexOf('id="fenster-hospitality"'));
    assert.match(onboarding, /setEinladungFrage\(true\)/);
  });

  it("nach der Zusage lesen Hauptaktion, Marken und „Als Nächstes“ aus den nächsten Pflichten, die Einladung fragt vorher", () => {
    const f = fenster();
    assert.match(f, /const pflichten = naechstePflichten\(speaker\);/);
    assert.match(f, /const marken = blockMarken\(pflichten\);/);
    assert.match(f, /const aktion = hauptaktion\(speaker, isTeam\);/);
    assert.match(kopf(), /t\[`duty_\$\{naechstes\.pflicht\}`\]/);
    assert.match(kopf(), /nachZusage && !gast \? t\.dutiesDone : t\.noNextStep/);
    // eine Mail an den Speaker löst die Einladung aus: sie fragt vorher und nennt die Adresse
    assert.match(f, /fuehreAus\(\(\) => inviteSpeaker\(speaker\.id\), t\.invited\)/);
    assert.match(f, /nenne\(t\.inviteConfirmBody, \{ email: speaker\.email \}\)/);
    // die Karten „Hat die Person zugesagt?“ und „Nächste Schritte“ gibt es nicht mehr
    assert.doesNotMatch(f, /fenster-pflichten|fenster-zusage|confirmPromptTitle|dutiesTitle/);
  });

  it("die Pipeline-Liste meldet die Zusage in der Zeile — nur bei Lead und Kontaktiert", () => {
    const l = liste();
    assert.match(l, /setPipeline\(s\.id, "confirmed"\)/);
    assert.match(l, /kannZusageMelden\(s\.pipeline_status\) && \(/);
    assert.match(l, /<Th>\{t\.colAction\}<\/Th>/);
  });

  it("der Admin hat dieselbe Hauptaktion im Kopf des Speakers (Admin-Weg) — derselbe Baustein wie das Fenster", () => {
    const d = quelle("app/(admin)/admin/speaker/[id]/Detail.tsx");
    assert.match(d, /<SpeakerKopf\b/);
    assert.match(d, /setPipeline: \(status, grund\) => setPipeline\(speaker\.id, status, grund \?\? null\)/);
    // die Zusage in einem Klick steht im Kopf, für Fenster und Admin zugleich
    assert.match(kopf(), /aktionen\.setPipeline\("confirmed"\), t\.confirmedMoved\.replace\("\{name\}", name\)/);
    assert.match(kopf(), /kannZusageMelden\(speaker\.pipeline_status\) && <p className="ct-help mt-2">\{t\.pipelineLockedHint\}<\/p>/);
    for (const sprache of ["de", "en"] as const) {
      assert.ok(woerterbuch(sprache).leads.confirmAction, `${sprache}.leads.confirmAction fehlt`);
    }
  });

  it("alle neuen Texte stehen in DE und EN", () => {
    const schluessel = [
      "colAction",
      "confirmAction",
      "confirmedMoved",
      "pipelineLockedHint",
      "dutiesDone",
      "duty_invite",
      "duty_hospitality",
      "duty_travel",
      "duty_session",
    ];
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache).leads;
      for (const k of schluessel) assert.ok(w[k], `${sprache}.leads.${k} fehlt`);
      assert.ok(w.confirmedMoved.includes("{name}"), `${sprache}.leads.confirmedMoved braucht {name}`);
    }
    // jede Pflicht, die `naechstePflichten` liefern kann, hat ihren Text
    const pflichten = ["invite", "hospitality", "travel", "session"];
    for (const p of pflichten) assert.ok(woerterbuch("de").leads[`duty_${p}`]);
  });
});
