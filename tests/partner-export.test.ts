import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  antwortenDerZeile,
  bewerbungenCsv,
  exportDatum,
  exportDateiname,
  exportWert,
  type ExportTexte,
  type ExportZeile,
} from "@/lib/partner/bewerbungen-csv";

const sql = () => migrationText("v6_export_tour");
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const json = (p: string) => JSON.parse(src(p)) as Record<string, Record<string, unknown>>;

const TEXTE: ExportTexte = {
  kopf: {
    name: "Name",
    email: "E-Mail",
    linkedin: "LinkedIn-Profil",
    status: "Status der Bewerbung",
    beworben: "Beworben am",
    entschieden: "Entschieden am",
    bestaetigt: "Bestätigt am",
    taetigkeit: "Aktueller Status",
    karrierestufe: "Karrierelevel",
    arbeitgeber: "Arbeitgeber / Institution",
    hochschule: "Universität / Hochschule",
    studienfach: "Studienhintergrund",
    stadt: "Stadt",
  },
  ja: "Ja",
  nein: "Nein",
};

function zeile(teil: Partial<ExportZeile>): ExportZeile {
  return {
    bewerbung_id: "a1",
    name: "Erika Muster",
    email: "erika@example.org",
    linkedin: null,
    status: "shortlisted",
    beworben_am: "2027-02-01T09:15:00Z",
    entschieden_am: null,
    bestaetigt_am: null,
    taetigkeit: "student",
    karrierestufe: null,
    arbeitgeber: null,
    hochschule: "TU Hamburg",
    studienfach: "logistics",
    stadt: "Hamburg",
    antworten: null,
    ...teil,
  };
}

/** Die Datei als Zeilen aus Zellen, ohne BOM — reicht für Werte ohne Semikolon und Zeilenumbruch. */
function zellen(csv: string): string[][] {
  return csv
    .replace(/^\uFEFF/, "")
    .split("\r\n")
    .filter((r, i, alle) => i < alle.length - 1 || r !== "")
    .map((r) => (r === "" ? [] : r.split(";").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"'))));
}

const basis = {
  hinweis: "Datenschutzhinweis: nur für die Auswahl nutzen.",
  fragen: new Map<string, string>(),
  fragenReihenfolge: [] as string[],
  statusLabels: { shortlisted: "Vorgemerkt", accepted: "Zugesagt" },
  vokabeln: {
    occupation_status: { student: "Studium" },
    career_level: {},
    study_field: { logistics: "Logistik" },
  },
  locale: "de",
  texte: TEXTE,
};

describe("Bewerbungen als CSV (PART-051)", () => {
  it("BOM, Datenschutzhinweis in der ersten Zeile, Leerzeile, dann Kopf und Daten", () => {
    const csv = bewerbungenCsv({ ...basis, zeilen: [zeile({})] });
    assert.ok(csv.startsWith("\uFEFF"), "BOM fehlt — Excel erkennt sonst UTF-8 nicht");
    assert.ok(csv.endsWith("\r\n"));
    const r = zellen(csv);
    assert.deepEqual(r[0], [basis.hinweis]);
    assert.deepEqual(r[1], []);
    assert.deepEqual(r[2].slice(0, 4), ["Name", "E-Mail", "LinkedIn-Profil", "Status der Bewerbung"]);
    assert.deepEqual(r[3].slice(0, 5), ["Erika Muster", "erika@example.org", "", "Vorgemerkt", "2027-02-01 10:15"]);
    // Vokabeln in der Sprache der Person statt Schlüssel.
    assert.equal(r[3][r[2].indexOf("Aktueller Status")], "Studium");
    assert.equal(r[3][r[2].indexOf("Studienhintergrund")], "Logistik");
    assert.equal(r.length, 4);
  });

  it("entschärft Formelanfänge in jeder Zelle (lib/csv.ts, Regel vom 18.09.)", () => {
    const csv = bewerbungenCsv({
      ...basis,
      zeilen: [zeile({ name: '=HYPERLINK("http://x")', stadt: "+49 40", antworten: { f1: "@SUMME(A1)" } })],
      fragen: new Map([["f1", "-Warum?"]]),
      fragenReihenfolge: ["f1"],
    });
    assert.ok(csv.includes('" =HYPERLINK(""http://x"")"'), "Formel im Namen nicht entschärft");
    assert.ok(csv.includes('" +49 40"'));
    assert.ok(csv.includes('" @SUMME(A1)"'));
    assert.ok(csv.includes('" -Warum?"'), "auch der Fragetext im Kopf ist Freitext");
    assert.ok(!/;=|;\+|;@|;"=/.test(csv));
  });

  it("eine Spalte je beantworteter Frage: Reihenfolge der Session, gleicher Text bleibt zwei Spalten, ohne Antwort keine Spalte", () => {
    const csv = bewerbungenCsv({
      ...basis,
      zeilen: [
        zeile({ antworten: { f2: "zwei", f1: ["a", "b"], alt: true } }),
        zeile({ bewerbung_id: "a2", name: "Max", antworten: { f3: "drei" } }),
      ],
      fragen: new Map([["f1", "Motivation"], ["f2", "Motivation"], ["f3", "Erfahrung"], ["f4", "Nie beantwortet"]]),
      fragenReihenfolge: ["f1", "f2", "f3", "f4"],
    });
    const r = zellen(csv);
    const kopf = r[2];
    assert.deepEqual(kopf.slice(-4), ["Motivation", "Motivation", "Erfahrung", "alt"]);
    assert.ok(!kopf.includes("Nie beantwortet"));
    assert.deepEqual(r[3].slice(-4), ["a, b", "zwei", "", "Ja"]);
    assert.deepEqual(r[4].slice(-4), ["", "", "drei", ""]);
  });

  it("Tour: Fragetext aus den Antworten, Spalte „Euer Wunsch“ nur mit Text im Kopf", () => {
    const tour = [
      zeile({ antworten: [{ key: "q1", label_de: "Warum die Tour?", label_en: "Why the tour?", value: "Logistik" }], wunsch: true }),
      zeile({ bewerbung_id: "a2", antworten: [], wunsch: false }),
    ];
    const r = zellen(bewerbungenCsv({ ...basis, zeilen: tour, texte: { ...TEXTE, kopf: { ...TEXTE.kopf, wunsch: "Euer Wunsch" } } }));
    assert.equal(r[2][4], "Euer Wunsch");
    assert.equal(r[3][4], "Ja");
    assert.equal(r[4][4], "Nein");
    assert.equal(r[2].at(-1), "Warum die Tour?");
    assert.equal(r[3].at(-1), "Logistik");

    const en = zellen(bewerbungenCsv({ ...basis, zeilen: tour, locale: "en" }));
    assert.ok(!en[2].includes("Euer Wunsch"), "ohne Text im Kopf keine Wunsch-Spalte");
    assert.equal(en[2].at(-1), "Why the tour?");
  });

  it("Datum in Berliner Zeit, sortierbar", () => {
    assert.equal(exportDatum("2027-04-16T12:30:00Z"), "2027-04-16 14:30");
    assert.equal(exportDatum("2027-01-10T23:30:00Z"), "2027-01-11 00:30");
    assert.equal(exportDatum(null), "");
  });

  it("Antwortwerte als Text", () => {
    const t = { ja: "Ja", nein: "Nein" };
    assert.equal(exportWert(["a", true], t), "a, Ja");
    assert.equal(exportWert("false", t), "Nein");
    assert.equal(exportWert(3, t), "3");
    assert.equal(exportWert({ x: 1 }, t), '{"x":1}');
    assert.equal(exportWert(undefined, t), "");
  });

  it("Antworten einer Zeile: Schlüssel bleiben, fehlender Text fällt auf den Schlüssel zurück", () => {
    assert.deepEqual(antwortenDerZeile({ f9: "x" }, new Map(), "de"), [{ key: "f9", label: "f9", wert: "x" }]);
    assert.deepEqual(
      antwortenDerZeile([{ key: "q", label_de: "Frage", label_en: "", value: 1 }], new Map(), "en"),
      [{ key: "q", label: "q", wert: 1 }],
    );
    assert.deepEqual(antwortenDerZeile(null, new Map(), "de"), []);
  });

  it("Dateiname nur aus Buchstaben, Ziffern und Bindestrich, Datum in Berliner Zeit", () => {
    const heute = new Date("2026-09-25T22:30:00Z");
    assert.equal(exportDateiname("Größte Tour: Straße & Hafen!", heute), "bewerbungen-grosste-tour-strasse-hafen-2026-09-26.csv");
    assert.equal(exportDateiname(null, heute), "bewerbungen-2026-09-26.csv");
    assert.equal(exportDateiname("   ", heute), "bewerbungen-2026-09-26.csv");
    assert.match(exportDateiname("x".repeat(200), heute), /^bewerbungen-x{60}-2026-09-26\.csv$/);
    assert.doesNotMatch(exportDateiname('a"b\\c;d', heute), /["\\;]/);
  });
});

describe("Export der Tour-Bewerbungen (PART-051, Datenbank)", () => {
  const rumpf = () => {
    const s = sql();
    const start = s.indexOf("create or replace function export_tour_applications(");
    assert.ok(start >= 0, "export_tour_applications fehlt");
    return s.slice(start, s.indexOf("$$;", start));
  };

  it("Recht wie die Liste, nur mit Einwilligung, jeder Export im Audit", () => {
    const f = rumpf();
    assert.match(f, /security definer/);
    assert.match(f, /set search_path = public, extensions/);
    assert.match(f, /if v_st\.host_org_id is null or not partner_can_edit\(v_st\.host_org_id\) then/);
    assert.match(f, /raise exception 'stop_not_found' using errcode = 'P0002'/);
    assert.match(f, /and a\.consent_share\s+-- ohne Einwilligung keine Zeile/);
    assert.match(f, /perform log_audit\('partner\.application_export'/);
    assert.match(f, /'tour', true/);
    // Keine Art.-9-Felder, kein Geburtsdatum, kein Telefon, keine internen Notizen.
    assert.doesNotMatch(f, /birth|phone|notes|dietary|accessib/);
  });

  it("dieselben Spalten wie der Formatexport, dazu der Wunsch dieses Stopps", () => {
    const f = rumpf();
    const live = src("supabase/snapshot/functions/export_session_applications.sql");
    const spalten = /RETURNS TABLE\(([^)]*)\)/.exec(live)?.[1].replace(/timestamp with time zone/g, "timestamptz").replace(/\s+/g, " ");
    const neu = /returns table \(([^)]*)\)/.exec(f)?.[1].replace(/\s+/g, " ");
    assert.ok(spalten && neu);
    assert.equal(neu, `${spalten}, wunsch boolean`);
    assert.match(f, /exists \(select 1 from company_tour_wish w where w\.stop_id = p_stop_id and w\.application_id = a\.id\)/);
  });

  it("authenticated darf, harden_definer_functions am Ende", () => {
    const s = sql();
    assert.match(s, /grant execute on function export_tour_applications\(uuid\) to authenticated;/);
    assert.match(s.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("Export in Portal und Admin (PART-051)", () => {
  it("Download als echtes <a download>, nie als Next-Link — Vorladen löste sonst Export und Audit aus", () => {
    const button = src("components/ui/Button.tsx");
    const teil = button.slice(button.indexOf("export function ButtonDownload"), button.indexOf("function Spinner"));
    assert.match(teil, /<a \{\.\.\.rest\} download /);
    assert.doesNotMatch(teil, /<Link/);
    for (const p of [
      "app/(partner)/partner/FormatBewerbungen.tsx",
      "app/(partner)/partner/company-tour/TourBewerbungen.tsx",
      "app/(admin)/admin/bewerbungen/[id]/page.tsx",
    ]) {
      const s = src(p);
      assert.match(s, /<ButtonDownload href=\{`\/(partner|admin)\/(export|bewerbungen)\//, p);
      assert.doesNotMatch(s, /<(ButtonLink|Link)[^>]*export/, p);
    }
  });

  it("Routen: Gate, die Export-RPC entscheidet, Personendaten nicht zwischenspeichern", () => {
    const format = src("app/(partner)/partner/export/format/[session]/route.ts");
    const tour = src("app/(partner)/partner/export/tour/[stop]/route.ts");
    const admin = src("app/(admin)/admin/bewerbungen/[id]/export/route.ts");
    assert.match(format, /requireArea\("partner"/);
    assert.match(format, /rpc\("export_session_applications"/);
    assert.match(tour, /requireArea\("partner"/);
    assert.match(tour, /rpc\("export_tour_applications"/);
    assert.match(tour, /mitWunsch: true/);
    assert.match(admin, /requireAdminSection\("applications"/);
    assert.match(admin, /rpc\("export_session_applications"/);
    const antwort = src("lib/partner/export-antwort.ts");
    assert.match(antwort, /"Cache-Control": "no-store"/);
    assert.match(antwort, /rpc\("export_privacy_notice"/);
    assert.match(antwort, /attachment; filename=/);
    // Keine Datenbankmeldung nach aussen, nur der Schlüssel.
    assert.match(antwort, /toRpcFailure\(error\)\.key/);
  });

  it("Texte in beiden Sprachen", () => {
    for (const sprache of ["de", "en"]) {
      const d = json(`lib/i18n/${sprache}.json`);
      const b = d.partnerBewerbung as Record<string, string>;
      for (const k of ["exportCsv", "exportHint", "csvName", "csvEmail", "csvStatus", "csvWish", "csvApplied", "csvDecided", "csvConfirmed"]) {
        assert.ok(b[k]?.trim(), `${sprache}: partnerBewerbung.${k} fehlt`);
      }
      const a = (d.admin as Record<string, Record<string, string>>).applications;
      assert.ok(a.exportCsv?.trim() && a.exportHint?.trim(), `${sprache}: admin.applications.export* fehlt`);
    }
  });
});
