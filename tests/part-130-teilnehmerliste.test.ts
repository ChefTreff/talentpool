import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { bewerbungenCsv, exportDateiname, type ExportTexte, type ExportZeile } from "@/lib/partner/bewerbungen-csv";
import {
  EXPORT_NUR_PARAM,
  EXPORT_NUR_TEILNEHMENDE,
  exportAdresse,
  filterTeilnehmende,
  nimmtTeil,
  willTeilnehmende,
} from "@/lib/partner/teilnehmende";

/**
 * PART-130 — Teilnehmerliste als CSV (Konrad & Leopold 05.10.2026): die Bewerbungsliste, gefiltert auf die, die teilnehmen. Derselbe Weg, dieselbe Einwilligungsgrenze, derselbe Eintrag im
 * Protokoll; neu sind der Filter in der Adresse (`?nur=teilnehmende`), der Dateiname und je ein Knopf im Reiter „Teilnehmende“ (Portal) und in der Entscheidungssicht (Admin).
 */

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const json = (p: string) => JSON.parse(src(p)) as Record<string, Record<string, unknown>>;
/** Kommentare raus: ein Satz, der etwas erwähnt, ist keine Anweisung. */
const tsCode = (ts: string) => ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const TEXTE: ExportTexte = {
  kopf: {
    name: "Name", email: "E-Mail", linkedin: "LinkedIn", status: "Status", beworben: "Beworben", entschieden: "Entschieden", bestaetigt: "Bestätigt",
    taetigkeit: "Tätigkeit", karrierestufe: "Karrierelevel", arbeitgeber: "Arbeitgeber", hochschule: "Hochschule", studienfach: "Studienfach", stadt: "Stadt",
  },
  ja: "Ja",
  nein: "Nein",
};
const zeile = (name: string, status: string): ExportZeile => ({
  bewerbung_id: `b-${name}`, name, email: `${name.toLowerCase()}@example.org`, linkedin: null, status, beworben_am: "2027-02-01T09:15:00Z", entschieden_am: null, bestaetigt_am: null,
  taetigkeit: null, karrierestufe: null, arbeitgeber: null, hochschule: null, studienfach: null, stadt: null, antworten: null,
});

describe("PART-130: wer teilnimmt", () => {
  it("zugesagt, nachgerückt, bestätigt — alles andere nicht", () => {
    for (const s of ["accepted", "promoted", "confirmed"]) assert.equal(nimmtTeil(s), true, s);
    for (const s of ["applied", "shortlisted", "waitlisted", "declined", "expired", "withdrawn", "", "Accepted", "unbekannt"]) assert.equal(nimmtTeil(s), false, s);
  });

  it("der Filter behält die Reihenfolge und dieselben Objekte, verändert die Eingabe nicht und lässt eine leere Liste leer", () => {
    const a = zeile("Anna", "accepted");
    const b = zeile("Ben", "declined");
    const c = zeile("Cem", "promoted");
    const d = zeile("Dora", "applied");
    const e = zeile("Emil", "confirmed");
    const eingabe = [a, b, c, d, e];
    const aus = filterTeilnehmende(eingabe);
    assert.deepEqual(aus.map((z) => z.name), ["Anna", "Cem", "Emil"]);
    assert.equal(aus[0], a, "dasselbe Objekt, keine Kopie");
    assert.equal(eingabe.length, 5, "die Eingabe bleibt unverändert");
    assert.deepEqual(filterTeilnehmende([]), []);
    assert.deepEqual(filterTeilnehmende([b, d]), []);
  });

  it("die Datei mit gefilterten Zeilen enthält genau die Teilnehmenden — und sonst nichts von den anderen", () => {
    const zeilen = [zeile("Anna", "accepted"), zeile("Ben", "declined"), zeile("Cem", "shortlisted"), zeile("Dora", "confirmed")];
    const csv = bewerbungenCsv({
      hinweis: "Hinweis", zeilen: filterTeilnehmende(zeilen), fragen: new Map(), fragenReihenfolge: [], statusLabels: {}, vokabeln: { occupation_status: {}, career_level: {}, study_field: {} },
      locale: "de", texte: TEXTE,
    });
    assert.ok(csv.includes("Anna") && csv.includes("Dora"));
    assert.ok(!csv.includes("Ben") && !csv.includes("Cem") && !csv.includes("ben@example.org") && !csv.includes("cem@example.org"));
  });
});

describe("PART-130: Adresse und Dateiname", () => {
  it("die Adresse trägt den Filter nur für die Teilnehmerliste; die Bewerbungen bleiben unverändert", () => {
    assert.equal(exportAdresse("/partner/export/format/abc", false), "/partner/export/format/abc");
    assert.equal(exportAdresse("/partner/export/format/abc", true), "/partner/export/format/abc?nur=teilnehmende");
    assert.equal(`${EXPORT_NUR_PARAM}=${EXPORT_NUR_TEILNEHMENDE}`, "nur=teilnehmende");
  });

  it("die Route erkennt nur genau diesen Wert — alles andere bleibt der Bewerbungsexport, nie ein Fehler", () => {
    assert.equal(willTeilnehmende("http://localhost:3000/partner/export/format/abc?nur=teilnehmende"), true);
    assert.equal(willTeilnehmende("/partner/export/tour/xyz?nur=teilnehmende"), true, "auch relativ");
    assert.equal(willTeilnehmende("/x?instanz=2&nur=teilnehmende"), true, "mit anderen Parametern");
    for (const nein of ["/x", "/x?nur=", "/x?nur=alle", "/x?nur=Teilnehmende", "/x?nur=teilnehmende2", "/x?nurr=teilnehmende", "/x?teilnehmende=1", "http://[kaputt"]) {
      assert.equal(willTeilnehmende(nein), false, nein);
    }
    // Rundlauf: was die Ansicht baut, erkennt die Route.
    assert.equal(willTeilnehmende(exportAdresse("/a/b", true)), true);
    assert.equal(willTeilnehmende(exportAdresse("/a/b", false)), false);
  });

  it("die Teilnehmerliste heißt anders als der Bewerbungsexport, sonst bleibt der Name wie bisher", () => {
    const heute = new Date("2026-09-26T10:00:00Z");
    assert.equal(exportDateiname("TEST — Masterclass", heute), "bewerbungen-test-masterclass-2026-09-26.csv");
    assert.equal(exportDateiname("TEST — Masterclass", heute, "bewerbungen"), "bewerbungen-test-masterclass-2026-09-26.csv");
    assert.equal(exportDateiname("TEST — Masterclass", heute, "teilnehmende"), "teilnehmende-test-masterclass-2026-09-26.csv");
    assert.equal(exportDateiname(null, heute, "teilnehmende"), "teilnehmende-2026-09-26.csv");
  });
});

describe("PART-130: Routen und Antwort", () => {
  it("jede der drei Routen gibt den Filter aus der Adresse an die gemeinsame Antwort — genau einmal, mit `request`", () => {
    for (const p of [
      "app/(partner)/partner/export/format/[session]/route.ts",
      "app/(partner)/partner/export/tour/[stop]/route.ts",
      "app/(admin)/admin/bewerbungen/[id]/export/route.ts",
    ]) {
      const s = tsCode(src(p));
      assert.match(s, /export async function GET\(request: Request,/, `${p}: die Anfrage wird gelesen`);
      assert.equal([...s.matchAll(/teilnehmende: willTeilnehmende\(request\.url\)/g)].length, 1, `${p}: genau einmal`);
      assert.equal([...s.matchAll(/return exportAntwort\(/g)].length, 1, `${p}: eine Antwort`);
      assert.match(s, /import \{ willTeilnehmende \} from "@\/lib\/partner\/teilnehmende";/, p);
      // Dieselben Gates und dieselbe RPC wie vorher — der Filter öffnet nichts.
      assert.match(s, /requireArea\("partner"|requireAdminSection\("applications"/, p);
      assert.match(s, /rpc\("export_(session|tour)_applications"/, p);
    }
  });

  it("die Antwort filtert erst, wenn `teilnehmende` gesetzt ist, und benennt die Datei danach", () => {
    const s = tsCode(src("lib/partner/export-antwort.ts"));
    assert.match(s, /teilnehmende = false,/);
    assert.match(s, /zeilen: teilnehmende \? filterTeilnehmende\(zeilen\) : zeilen,/);
    assert.match(s, /exportDateiname\(titel, new Date\(\), teilnehmende \? "teilnehmende" : "bewerbungen"\)/);
    // Die Einwilligungsgrenze und das Protokoll liegen in der RPC; die Antwort fügt keinen Zugriff hinzu.
    assert.doesNotMatch(s, /\.from\(\s*"application"|\.from\(\s*"person"/);
    assert.match(s, /"Cache-Control": "no-store"/);
  });

  it("der Filter steht an einer Stelle: beide Ansichten und die Antwort nehmen dieselben Status", () => {
    const modul = tsCode(src("lib/partner/teilnehmende.ts"));
    assert.match(modul, /new Set\(\["accepted", "promoted", "confirmed"\]\)/);
    for (const p of ["app/(partner)/partner/FormatBewerbungen.tsx", "app/(partner)/partner/company-tour/TourBewerbungen.tsx"]) {
      const s = tsCode(src(p));
      assert.doesNotMatch(s, /DABEI/, `${p}: keine zweite Liste der Status`);
      assert.match(s, /\.filter\(\(a\) => !nurTeilnehmende \|\| nimmtTeil\(a\.status\)\)/, p);
    }
    assert.doesNotMatch(tsCode(src("lib/partner/export-antwort.ts")), /"accepted"/);
  });
});

describe("PART-130: Knopf im Reiter „Teilnehmende“ (Portal) und in der Entscheidungssicht (Admin)", () => {
  it("Portal: der Knopf steht in beiden Reitern — nur für wen pflegen darf und nur mit mindestens einer Einwilligung unter den gezeigten Zeilen", () => {
    for (const [p, basis] of [
      ["app/(partner)/partner/FormatBewerbungen.tsx", "/partner/export/format/${x.id}"],
      ["app/(partner)/partner/company-tour/TourBewerbungen.tsx", "/partner/export/tour/${x.stop_id}"],
    ] as const) {
      const s = tsCode(src(p));
      assert.match(s, /\{canEdit && zeilen\.some\(\(a\) => a\.consent_share\) && \(/, `${p}: Recht und Einwilligung`);
      assert.ok(s.includes(`<ButtonDownload href={exportAdresse(\`${basis}\`, nurTeilnehmende)}>`), `${p}: Adresse mit Filter`);
      assert.match(s, /\{nurTeilnehmende \? (s|t\.bewerbung)\.participantsExportCsv : (s|t\.bewerbung)\.exportCsv\}/, `${p}: Beschriftung je Reiter`);
      assert.match(s, /\{canEdit && ` \$\{nurTeilnehmende \? (s|t\.bewerbung)\.participantsExportHint : (s|t\.bewerbung)\.exportHint\}`\}/, `${p}: Hinweis je Reiter`);
      // Ein echter Download, nie ein Link (Vorladen löste den Export samt Protokoll schon ohne Klick aus).
      assert.doesNotMatch(s, /<(ButtonLink|Link)[^>]*export/, p);
    }
  });

  it("Admin-Vollständigkeit: dieselbe Datei als zweiter Knopf in der Entscheidungssicht, mit dem Filter in der Adresse", () => {
    const s = tsCode(src("app/(admin)/admin/bewerbungen/[id]/page.tsx"));
    assert.ok(s.includes("<ButtonDownload href={exportAdresse(`/admin/bewerbungen/${id}/export`, true)}"));
    assert.match(s, /t\.admin\.applications\.participantsExportCsv/);
    assert.match(s, /title=\{t\.admin\.applications\.participantsExportHint\}/);
    // Der bisherige Export bleibt daneben.
    assert.ok(s.includes("<ButtonDownload href={`/admin/bewerbungen/${id}/export`}"));
  });

  it("Texte in beiden Sprachen; die Partnertexte in der Ihr-Ansprache, der Hinweis nennt Einwilligung und Protokoll", () => {
    for (const sprache of ["de", "en"]) {
      const d = json(`lib/i18n/${sprache}.json`);
      const b = d.partnerBewerbung as Record<string, string>;
      const a = (d.admin as Record<string, Record<string, string>>).applications;
      for (const k of ["participantsExportCsv", "participantsExportHint"]) {
        assert.ok(b[k]?.trim(), `${sprache}: partnerBewerbung.${k}`);
        assert.ok(a[k]?.trim(), `${sprache}: admin.applications.${k}`);
      }
      assert.notEqual(b.participantsExportCsv, b.exportCsv, `${sprache}: die Beschriftung unterscheidet sich vom Bewerbungsexport`);
      assert.notEqual(a.participantsExportCsv, a.exportCsv, `${sprache}: admin: dasselbe`);
    }
    const de = json("lib/i18n/de.json");
    const hinweis = (de.partnerBewerbung as Record<string, string>).participantsExportHint;
    assert.match(hinweis, /Einwilligung/);
    assert.match(hinweis, /protokolliert/);
    assert.match(hinweis, /Datenschutzhinweis/);
    assert.doesNotMatch(JSON.stringify([hinweis, (de.partnerBewerbung as Record<string, string>).participantsExportCsv]), /\bSie\b|\bIhre[mnrs]?\b/);
    const en = (json("lib/i18n/en.json").partnerBewerbung as Record<string, string>).participantsExportHint;
    assert.match(en, /consent|agreed/);
    assert.match(en, /logged/);
  });
});

describe("PART-130: Testdaten für Konrads Konto und Doku", () => {
  it("der Schritt `teilnehmende` legt je Format eine zugesagte TEST-Person MIT Einwilligung an, ohne Mail, und räumt sie wieder weg", () => {
    const skript = src("scripts/testdaten-konrad.mjs");
    assert.match(skript, /teilnehmende: teilnehmendeSchritt,/);
    assert.match(skript, /--nur=teilnehmende/);
    const schritt = skript.slice(skript.indexOf("async function teilnehmendeSchritt"), skript.indexOf("async function produktionSchritt"));
    assert.match(schritt, /status: "accepted", consent_share: true/);
    assert.match(schritt, /rpc\("decisions_released"/, "keine Zusage in einer Session mit freigegebenen Entscheidungen — das löste eine Mail aus");
    // Das `continue;` steht **in** dem Zweig (nicht irgendwo dahinter): sonst schriebe der Schritt die Zusage doch.
    assert.match(schritt, /if \(fe \|\| freigegeben\) \{[^}]*continue;[^}]*\}/);
    assert.match(schritt, /if \(!se\) \{[^}]*continue;[^}]*\}/, "fehlt die Session, geht der Schritt zur nächsten");
    assert.match(schritt, /rpc\("testdaten_person", \{\s*p_first_name: "TEST", p_last_name: z\.name, p_email: teilnehmendeAdresse\(z\.adresse\),?\s*\}\)/, "die Person heißt TEST — das Aufräumen findet sie daran");
    assert.match(schritt, /\.eq\("first_name", "TEST"\)\.is\("auth_user_id", null\)/, "Profilwerte nur an TEST-Personen ohne Konto");
    assert.match(schritt, /onConflict: "session_id,person_id"/, "ein zweiter Lauf legt nichts doppelt an");
    const ziele = skript.slice(skript.indexOf("const TEILNEHMENDE_ZIELE"), skript.indexOf("async function teilnehmendeSchritt"));
    assert.match(ziele, /\$\{PREFIX\}Masterclass`/);
    assert.match(ziele, /\$\{PREFIX\}Interview Table`/);
    assert.match(ziele, /\+zztest-teiln-\$\{n\}@/);
    // Aufräumen: nur TEST-Personen ohne Konto, über ihre Adressen.
    const aufraeumen = skript.slice(skript.indexOf('"TEST-Teilnehmende der Teilnehmerliste entfernt"'), skript.indexOf('"Talk-Speaker entfernt'));
    assert.match(aufraeumen, /TEILNEHMENDE_ZIELE\.map\(\(z\) => teilnehmendeAdresse\(z\.adresse\)\)/);
    assert.match(aufraeumen, /\.eq\("first_name", "TEST"\)\.is\("auth_user_id", null\)/);
  });

  it("Doku: der Testdaten-Absatz nennt Schritt, Voraussetzung und Klickweg (Portal und Admin)", () => {
    const doku = src("docs/testdaten-konrad.md");
    const i = doku.indexOf("**Teilnehmerliste als CSV (PART-130):**");
    assert.ok(i > 0, "Absatz zum Schritt fehlt");
    const absatz = doku.slice(i, doku.indexOf("\n\n", i));
    assert.match(absatz, /--apply --nur=teilnehmende/);
    assert.match(absatz, /\/partner\/masterclass\/teilnehmende/);
    assert.match(absatz, /\/partner\/interview-tables\/teilnehmende/);
    assert.match(absatz, /\/admin\/bewerbungen\//);
    assert.match(absatz, /partner/);
  });
});
