import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { challengesDerOrganisation } from "@/components/partner/hackathon-challenge";

/**
 * PART-142 (Konrad & Leopold 05.10., Teil 1) — Partnerseite „Hackathon“: **eine Challenge je Partner** und „Auf dieser Seite“. Die Seite zeigt Wunschprofil und Datensatz der Challenge der
 * **gezeigten Organisation**; die Funktionen dahinter liefern für das Hackathon-Team und für Personen mit mehreren Organisationen alles, was sie bearbeiten dürfen (Konrad sah in seiner Test-Organisation
 * deshalb zwei Wunschprofile und zwei Datensätze). Die zweite TEST-Challenge gehört einer eigenen TEST-Organisation. Nicht in diesem Teil: „Challenge-Infos nachträglich bearbeiten“ — dafür fehlt ein
 * Weg im System (`submit_deliverable` nimmt nur offene, abgelehnte und überfällige Pflichtstücke, die Review-Liste des Teams zeigt keine freigegebenen), das ist eine Produktfrage an Plan.
 */

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** Kommentare raus: ein Satz, der etwas erwähnt, ist keine Anweisung. */
const code = (ts: string) => ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{?\/\/[^\n]*/g, "");

const PAGE = "app/(partner)/partner/hackathon/page.tsx";

describe("PART-142: die Challenges der gezeigten Organisation", () => {
  const zeile = (org: string | null, id = org ?? "ohne") => ({ id, org_name: org });

  it("zwei Challenges zweier Organisationen ⇒ die der gezeigten (Konrads Fall: Test-Organisation und die des zweiten Tracks)", () => {
    const rows = [zeile("TEST — Partner", "predict"), zeile("TEST — Challenge-Partner", "canteen")];
    assert.deepEqual(challengesDerOrganisation(rows, "TEST — Partner").map((r) => r.id), ["predict"]);
    assert.deepEqual(challengesDerOrganisation(rows, "TEST — Challenge-Partner").map((r) => r.id), ["canteen"]);
  });

  it("der Name gilt ganz, nicht als Teilstück: „TEST — Partner“ ist nicht „TEST — Partner Angebot“ — und Leerraum am Rand zählt nicht", () => {
    const rows = [zeile("TEST — Partner Angebot", "a"), zeile("  TEST — Partner  ", "b"), zeile("test — partner", "c")];
    assert.deepEqual(challengesDerOrganisation(rows, "TEST — Partner").map((r) => r.id), ["b"]);
    assert.deepEqual(challengesDerOrganisation(rows, " TEST — Partner ").map((r) => r.id), ["b"]);
  });

  it("eine Challenge ohne Organisation (vom Team angelegt) gehört keinem Partner und steht nie da", () => {
    const rows = [zeile(null, "team"), zeile("TEST — Partner", "p")];
    assert.deepEqual(challengesDerOrganisation(rows, "TEST — Partner").map((r) => r.id), ["p"]);
    assert.deepEqual(challengesDerOrganisation([zeile(null, "team")], "TEST — Partner"), []);
  });

  it("ohne Namen der Organisation lässt sich nicht eingrenzen: die Liste bleibt, wie sie ist — als Kopie, nie verändert", () => {
    const rows = [zeile("A", "a"), zeile("B", "b")];
    for (const leer of [null, undefined, "", "   "]) {
      const aus = challengesDerOrganisation(rows, leer);
      assert.deepEqual(aus.map((r) => r.id), ["a", "b"]);
      assert.notEqual(aus, rows, "eine Kopie, nicht dasselbe Feld");
    }
    challengesDerOrganisation(rows, "A");
    assert.deepEqual(rows.map((r) => r.id), ["a", "b"], "die Eingabe bleibt unberührt");
  });

  it("der Baustein ist reine Logik und nennt die Grenze: Anzeige, keine Berechtigung", () => {
    const q = src("components/partner/hackathon-challenge.ts");
    assert.doesNotMatch(code(q), /supabase|service_role|import /);
    assert.match(q, /Anzeige, keine Grenze/);
  });
});

describe("PART-142: die Seite", () => {
  it("Wunschprofil und Datensatz werden auf die gezeigte Organisation eingegrenzt — der Datensatz **vor** dem Signieren der Download-Adressen", () => {
    const s = code(src(PAGE));
    assert.match(s, /import \{ challengesDerOrganisation \} from "@\/components\/partner\/hackathon-challenge";/);
    assert.match(s, /const wunschprofile = challengesDerOrganisation\(\(\(profilRows \?\? \[\]\) as Wunschprofil\[\]\)\.filter\(\(p\) => p\.can_edit\), current\.communication_name\);/);
    assert.match(s, /challengesDerOrganisation\(\(targetRows \?\? \[\]\) as DatasetTarget\[\], current\.communication_name\)\.map\(async \(d\) => \(\{/);
    assert.ok(s.indexOf("challengesDerOrganisation((targetRows") < s.indexOf("datasetUrl(supabase"), "erst eingrenzen, dann Adressen signieren");
    // Das Recht bleibt: nur, was die Person pflegen darf (`can_edit`), und der Datensatz kommt aus der Funktion, die das Recht prüft.
    assert.match(s, /\.filter\(\(p\) => p\.can_edit\)/);
    assert.match(s, /supabase\.rpc\("hack_dataset_targets"/);
    assert.doesNotMatch(s, /service_role|createSupabaseAdminClient|SUPABASE_SECRET/);
  });

  it("„Auf dieser Seite“ steht direkt unter dem Seitenkopf, nur mit gebuchtem Hackathon, und jeder Eintrag hat seinen Anker an der Karte", () => {
    const s = code(src(PAGE));
    assert.match(s, /import \{ AbschnittsNavigation \} from "@\/components\/ui\/Abschnitte";/);
    assert.match(s, /<PageHeader word=\{t\.partner\.wordChallenge\} title=\{s\.title\} description=\{s\.lead\} \/>\s+\{gebucht\.length > 0 && <AbschnittsNavigation label=\{t\.common\.onThisPage\} items=\{abschnitte\} \/>\}/);
    const ids = [...(/const abschnitte = \[([\s\S]*?)\n  \];/.exec(s)?.[1] ?? "").matchAll(/id: "([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids, ["challenge", "rueckwand", "wunschprofil", "datensatz"]);
    const anker = [...s.matchAll(/<Card id="([a-z]+)">/g)].map((m) => m[1]);
    assert.deepEqual(anker, ids, "Menü und Karten nennen dieselben Anker in derselben Reihenfolge");
    // Die Einträge heißen wie die Überschriften der Karten.
    assert.match(s, /\{ id: "challenge", label: label\(challenge\) \}/);
    assert.match(s, /\{ id: "rueckwand", label: label\(backdrop\) \}/);
    assert.match(s, /\{ id: "wunschprofil", label: t\.hackWish\.wishPartnerTitle \}/);
    assert.match(s, /\{ id: "datensatz", label: s\.datasetTitle \}/);
  });

  it("die Seite nennt die Regel im Kopf: eine Challenge je Partner, eingegrenzt auf die Organisation", () => {
    const roh = src(PAGE);
    assert.match(roh, /\*\*Eine Challenge je Partner\*\* \(PART-142/);
    assert.match(roh, /challengesDerOrganisation/);
  });
});

describe("PART-142: Testdaten — die zweite TEST-Challenge gehört einer eigenen TEST-Organisation", () => {
  const skript = src("scripts/testdaten-konrad.mjs");
  const funktion = (name: string) => {
    const i = skript.indexOf(`async function ${name}(`);
    assert.ok(i >= 0, `${name} fehlt`);
    return code(skript.slice(i, skript.indexOf("\n}\n", i)));
  };

  it("genau eine der beiden Challenges trägt `eigeneOrg` — die in Konrads Test-Organisation bleibt „Predict the queue“ (Metrik, Datensatz, Wunschprofil)", () => {
    const liste = /const TEST_CHALLENGES = \[([\s\S]*?)\n\];/.exec(skript)?.[1] ?? "";
    const eintraege = [...liste.matchAll(/\{ title_en: `\$\{PREFIX\}([^`]+)`[\s\S]*?(?=\n  \{ title_en|\s*$)/g)].map((m) => m[0]);
    assert.equal(eintraege.length, 2);
    assert.doesNotMatch(eintraege[0], /eigeneOrg/);
    assert.match(eintraege[0], /Predict the queue/);
    assert.match(eintraege[1], /Pitch the canteen of 2030/);
    assert.match(eintraege[1], /eigeneOrg: true/);
    assert.match(skript, /const CHALLENGE_ORG = `\$\{PREFIX\}Challenge-Partner GmbH`;/);
    assert.match(skript, /const CHALLENGE_ORG_NAME = `\$\{PREFIX\}Challenge-Partner`;/);
  });

  it("der Schritt legt die Organisation an (nur Name, keine Edition, keine Mitglieder), setzt jede Challenge zu ihrer Inhaberin und zieht eine vorhandene um", () => {
    const f = funktion("hackathonChallenges");
    assert.match(f, /\.from\("organization"\)\.select\("id"\)\.eq\("legal_name", CHALLENGE_ORG\)\.maybeSingle\(\)/);
    assert.match(f, /legal_name: CHALLENGE_ORG, communication_name: CHALLENGE_ORG_NAME/);
    assert.doesNotMatch(f.slice(f.indexOf("CHALLENGE_ORG_NAME,"), f.indexOf("for (const [i, c] of TEST_CHALLENGES")), /org_edition|org_membership/);
    assert.match(f, /const inhaber = c\.eigeneOrg \? fremdOrg : org;/);
    assert.match(f, /if \(inhaber && orgFalsch\) patch\.org_id = inhaber\.id;/);
    assert.match(f, /org_id: inhaber\.id, title_en: c\.title_en/);
    // Ein Lauf ohne die Inhaberin legt nichts an, was ihr nicht gehört.
    assert.match(f, /if \(!inhaber && mode !== "dry-run"\) \{ fail\(c\.title_en, "Inhaber-Organisation fehlt"\); continue; \}/);
    // Nichts außer der TEST-Challenge wird umgezogen: gesucht wird über den Titel mit Kennzeichen.
    assert.match(f, /\.eq\("edition_id", hackEd\)\.eq\("title_en", c\.title_en\)\.maybeSingle\(\)/);
  });

  it("`--remove` nimmt die Organisation mit — nach den Challenges, vor den Schichten", () => {
    const i = skript.indexOf('"Vierte TEST-Organisation (Hackathon-Challenge) entfernt"');
    assert.ok(i >= 0, "Aufräumschritt fehlt");
    const block = skript.slice(i, skript.indexOf("});", i));
    assert.match(block, /\.eq\("legal_name", CHALLENGE_ORG\)/);
    assert.match(block, /org_membership/);
    assert.ok(skript.indexOf('"TEST-Challenges entfernt"') < i, "erst die Challenges, dann ihre Organisation");
    assert.ok(i < skript.indexOf('"Schicht-Zuteilungen entfernt"'));
  });

  it("der Kopf des Skripts und die Doku sagen es", () => {
    assert.match(skript, /PART-142: nur „Predict the queue“ gehört\s+\*\s+Konrads Test-Organisation/);
    const doku = src("docs/testdaten-konrad.md");
    assert.match(doku, /„Pitch the canteen of 2030“ der eigenen TEST-Organisation „TEST — Challenge-Partner“\*\* \(PART-142/);
    assert.match(doku, /`\/partner\/hackathon` zeigt in Konrads Test-Organisation genau ein Wunschprofil und einen Datensatz/);
  });
});

describe("PART-142: Backlog", () => {
  it("die Zeile trägt den Stand von Teil 1 mit der PR-Nummer und nennt die offene Produktfrage zum nachträglichen Bearbeiten", () => {
    const zeile = src("docs/feedback/partner.md").split("\n").find((z) => z.startsWith("| PART-142 ")) ?? "";
    assert.match(zeile, /Teil 1: geplant #\d+|Teil 1: gebaut #\d+/);
    assert.match(zeile, /nachträglich bearbeiten/);
    assert.match(zeile, /Produktfrage/);
  });
});
