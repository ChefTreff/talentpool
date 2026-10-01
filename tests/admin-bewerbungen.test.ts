import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  ENTSCHEIDBAR,
  ENTSCHEIDUNGEN,
  filterAdresse,
  filterAktiv,
  LISTE_VORGABEN,
  listeFilter,
  SAMMEL_MAX,
  sammelErgebnis,
  SEITE_GROESSE,
  seitenAdresse,
  seitenZahl,
} from "@/lib/bewerbungen/liste";
import { BEWERBUNG_STATUS_TON, istVerdeckt } from "@/components/partner/bewerbung";
import de from "@/lib/i18n/de.json" with { type: "json" };
import en from "@/lib/i18n/en.json" with { type: "json" };

const sql = () => migrationText("v6_bewerbungen_uebersicht");
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const adresse = (s: string) => new URLSearchParams(s);
const ERLAUBT = { formate: ["masterclass", "company_tour"], status: ["applied", "accepted", "declined"] };
const SESSION = "0b6d3c1e-2f4a-4b5c-8d9e-0f1a2b3c4d5e";

describe("Bewerbungsliste: Filter aus der Adresse (ADM-003)", () => {
  it("ohne Parameter: alles, Seite 1, leeres Formular", () => {
    const { werte, filter } = listeFilter(adresse(""), ERLAUBT);
    assert.deepEqual(werte, LISTE_VORGABEN);
    assert.deepEqual(filter, { q: null, format: null, session: null, status: null, consent: null, seite: 1 });
  });

  it("übernimmt gültige Werte und schreibt die Session-Kennung klein", () => {
    const { werte, filter } = listeFilter(
      adresse(`q=+Anna+&format=masterclass&session=${SESSION.toUpperCase()}&status=accepted&einwilligung=ohne&seite=3`),
      ERLAUBT,
    );
    assert.deepEqual(filter, {
      q: "Anna",
      format: "masterclass",
      session: SESSION,
      status: "accepted",
      consent: false,
      seite: 3,
    });
    assert.equal(werte.session, SESSION);
    assert.equal(werte.seite, "3");
    assert.equal(listeFilter(adresse("einwilligung=mit"), ERLAUBT).filter.consent, true);
  });

  it("eine verbogene Adresse zeigt die ganze Liste statt eines Fehlers", () => {
    const { werte, filter } = listeFilter(
      adresse("format=keynote&session=123&status=gibtsnicht&einwilligung=vielleicht&seite=-3"),
      ERLAUBT,
    );
    assert.deepEqual(filter, { q: null, format: null, session: null, status: null, consent: null, seite: 1 });
    assert.deepEqual(werte, LISTE_VORGABEN);
    assert.equal(listeFilter(adresse("seite=abc"), ERLAUBT).filter.seite, 1);
    assert.equal(listeFilter(adresse("seite=0"), ERLAUBT).filter.seite, 1);
    assert.equal(listeFilter(adresse("seite=99999"), ERLAUBT).filter.seite, 10_000);
  });

  it("kürzt die Suche auf 100 Zeichen", () => {
    const { filter } = listeFilter(adresse(`q=${"x".repeat(150)}`), ERLAUBT);
    assert.equal(filter.q?.length, 100);
  });

  it("„Filter zurücksetzen“ nur, wenn ein Filter steht — die Seite zählt nicht", () => {
    assert.equal(filterAktiv(LISTE_VORGABEN), false);
    assert.equal(filterAktiv({ ...LISTE_VORGABEN, seite: "4" }), false);
    assert.equal(filterAktiv({ ...LISTE_VORGABEN, einwilligung: "ohne" }), true);
    assert.equal(filterAktiv({ ...LISTE_VORGABEN, q: "anna" }), true);
  });
});

describe("Bewerbungsliste: Blättern und Filterlinks", () => {
  const PFAD = "/admin/bewerbungen";

  it("Seitenlinks behalten die Filter; Seite 1 steht nicht in der Adresse", () => {
    assert.equal(seitenAdresse(PFAD, "format=masterclass&seite=2", 3), `${PFAD}?format=masterclass&seite=3`);
    assert.equal(seitenAdresse(PFAD, "format=masterclass&seite=2", 1), `${PFAD}?format=masterclass`);
    assert.equal(seitenAdresse(PFAD, "seite=2", 1), PFAD);
  });

  it("Filtern springt auf Seite 1 und lässt fremde Parameter stehen", () => {
    assert.equal(
      filterAdresse(PFAD, "?seite=4&q=anna&ruecksprung=1", { q: "berta", status: "accepted" }),
      `${PFAD}?q=berta&ruecksprung=1&status=accepted`,
    );
    assert.equal(filterAdresse(PFAD, "?seite=4&q=anna", { q: "", format: "" }), PFAD);
  });

  it("zählt Seiten, mindestens eine", () => {
    assert.equal(seitenZahl(0), 1);
    assert.equal(seitenZahl(-5), 1);
    assert.equal(seitenZahl(SEITE_GROESSE), 1);
    assert.equal(seitenZahl(SEITE_GROESSE + 1), 2);
    assert.equal(seitenZahl(25_000), 500);
  });

  it("eine Seite passt in eine Antwort der Datenbank (höchstens 200)", () => {
    assert.ok(SEITE_GROESSE >= 1 && SEITE_GROESSE <= 200);
    assert.match(sql(), /v_limit integer := least\(greatest\(coalesce\(p_limit, 50\), 1\), 200\)/);
  });
});

describe("Sammelentscheidung (ADM-003)", () => {
  it("zählt Erfolge und Gründe, häufigster Grund zuerst", () => {
    assert.deepEqual(
      sammelErgebnis([
        { ok: true, error_key: null },
        { ok: false, error_key: "not_allowed" },
        { ok: true, error_key: null },
        { ok: false, error_key: "not_decidable" },
        { ok: false, error_key: "not_allowed" },
        { ok: false, error_key: null },
      ]),
      {
        ok: 2,
        fehler: [
          ["not_allowed", 2],
          ["not_decidable", 1],
          ["unknown", 1],
        ],
      },
    );
    assert.deepEqual(sammelErgebnis([]), { ok: 0, fehler: [] });
  });

  it("Höchstzahl und Entscheidungen stimmen mit der Datenbank überein", () => {
    const text = sql();
    const max = text.match(/> (\d+) then\s+raise exception 'too_many_applications'/);
    assert.ok(max, "too_many_applications mit Höchstzahl in decide_applications");
    assert.equal(Number(max[1]), SAMMEL_MAX);
    const erlaubt = text.match(/p_status not in \(([^)]*)\) then\s+raise exception 'invalid_decision'/);
    assert.ok(erlaubt, "invalid_decision mit Liste in decide_applications");
    assert.deepEqual(
      erlaubt[1].split(",").map((s) => s.trim().replace(/'/g, "")),
      [...ENTSCHEIDUNGEN],
    );
  });

  it("geht je Bewerbung über decide_application — gleiche Rechte, Regeln und Audit wie der Einzelklick", () => {
    const text = sql();
    const bulk = text.slice(text.indexOf("create or replace function decide_applications"));
    assert.match(bulk, /perform decide_application\(v_id, p_status, null\)/);
    // Sortiert und ohne Doppelte: zwei gleichzeitige Sammelaktionen sperren in derselben Reihenfolge.
    assert.match(bulk, /select distinct u from unnest\([^)]*\)\)? as u where u is not null order by u/);
    // Ein Fehler einzelner Bewerbungen bricht die Sammlung nicht ab, sondern steht in ihrer Zeile.
    assert.match(bulk, /when sqlstate '42501' then[\s\S]*error_key := 'not_allowed'/);
    assert.doesNotMatch(bulk, /insert into audit_log/);
  });

  it("Häkchen nur, wo decide_application noch entscheidet (Live-Fassung)", () => {
    const live = readFileSync(new URL("../supabase/snapshot/functions/decide_application.sql", import.meta.url), "utf8");
    const gesperrt = live.match(/v_a\.status in \(([^)]*)\) then\s+raise exception 'not_decidable'/);
    assert.ok(gesperrt, "not_decidable mit Liste in decide_application");
    const abgewiesen = gesperrt[1].split(",").map((s) => s.trim().replace(/'/g, ""));
    const alle = sql().match(/p_status not in \(([^)]*)\) then\s+raise exception 'invalid_status'/)![1]
      .split(",").map((s) => s.trim().replace(/'/g, ""));
    assert.deepEqual(abgewiesen.filter((s) => ENTSCHEIDBAR.has(s)), []);
    assert.deepEqual([...ENTSCHEIDBAR, ...abgewiesen].sort(), [...alle].sort());
    const liste = src("app/(admin)/admin/bewerbungen/BewerbungsListe.tsx");
    assert.match(liste, /disabled=\{pending \|\| !ENTSCHEIDBAR\.has\(z\.status\)\}/);
    assert.match(liste, /new Set\(waehlbar\.map\(\(z\) => z\.id\)\)/);
  });

  it("die Oberfläche schickt höchstens SAMMEL_MAX Kennungen und fragt vorher nach", () => {
    const liste = src("app/(admin)/admin/bewerbungen/BewerbungsListe.tsx");
    assert.match(liste, /\.slice\(0, SAMMEL_MAX\)/);
    assert.match(liste, /<ConfirmDialog/);
    assert.match(liste, /bulkReleasedWarning/);
    assert.match(liste, /z\.released/);
    const actions = src("app/(admin)/admin/bewerbungen/actions.ts");
    assert.match(actions, /rpc\("decide_applications", \{\s*p_application_ids: applicationIds,\s*p_status: status,?\s*\}\)/);
  });
});

describe("Liste in der Datenbank: nur das Team, Rechte je Session", () => {
  it("SECURITY DEFINER mit festem search_path, Rechte einmal je Session (materialized)", () => {
    const text = sql();
    const liste = text.slice(
      text.indexOf("create or replace function applications_admin_list"),
      text.indexOf("create or replace function decide_applications"),
    );
    assert.match(liste, /security definer\s+set search_path = public, extensions/);
    assert.match(liste, /with erlaubt as materialized \(/);
    assert.match(liste, /and is_application_team\(se\.id\)/);
    // Partner sehen die Liste nicht — sonst fände die Namenssuche auch Bewerbungen ohne Einwilligung.
    assert.doesNotMatch(liste, /can_decide_session/);
    assert.match(liste, /count\(\*\) over \(\)/);
  });

  it("die Suche entwertet % und _ (kein Muster aus der Eingabe)", () => {
    assert.match(sql(), /replace\(replace\(replace\(v_q, '\\', '\\\\'\), '%', '\\%'\), '_', '\\_'\)/);
  });

  it("Rechte nur für angemeldete Nutzer, Migration endet mit harden_definer_functions", () => {
    const text = sql();
    assert.match(text, /grant execute on function applications_admin_list\([^)]*\) to authenticated;/);
    assert.match(text, /grant execute on function decide_applications\(uuid\[\], text\) to authenticated;/);
    assert.doesNotMatch(text, /to anon/);
    assert.match(text.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("Seite /admin/bewerbungen", () => {
  it("filtert und blättert auf dem Server", () => {
    const seite = src("app/(admin)/admin/bewerbungen/page.tsx");
    assert.match(seite, /requireAdminSection\("applications", PFAD\)/);
    assert.match(seite, /rpc\("applications_admin_list"/);
    assert.match(seite, /p_limit: SEITE_GROESSE/);
    assert.match(seite, /p_offset: \(filter\.seite - 1\) \* SEITE_GROESSE/);
    // Kein useUrlFilter: der schreibt die Adresse ohne Server-Rundlauf.
    assert.doesNotMatch(seite + src("app/(admin)/admin/bewerbungen/BewerbungsFilter.tsx"), /useUrlFilter/);
  });

  it("das Filterformular funktioniert auch ohne JavaScript (GET)", () => {
    const filter = src("app/(admin)/admin/bewerbungen/BewerbungsFilter.tsx");
    assert.match(filter, /method="get"/);
    for (const name of ["q", "format", "session", "status", "einwilligung"]) {
      assert.match(filter, new RegExp(`name="${name}"`), `Feld ${name}`);
    }
  });

  it("Admin-Weg zur Session-Übersicht bleibt: Reiter „Je Session“ und Rücksprung in die Liste", () => {
    const sessions = src("app/(admin)/admin/bewerbungen/sessions/page.tsx");
    assert.match(sessions, /requireAdminSection\("applications", `\$\{PFAD\}\/sessions`\)/);
    assert.match(sessions, /\?session=\$\{s\.session_id\}/);
    assert.match(src("app/(admin)/admin/bewerbungen/[id]/page.tsx"), /\?session=\$\{id\}/);
  });
});

describe("Bewerbungsdetails als gemeinsamer Baustein", () => {
  it("Partner ohne Einwilligung: verdeckt; Team sieht dieselbe Bewerbung mit Namen", () => {
    assert.equal(istVerdeckt({ consent_share: false, display_name: null }), true);
    assert.equal(istVerdeckt({ consent_share: false, display_name: "Anna Test" }), false);
    assert.equal(istVerdeckt({ consent_share: true, display_name: "Anna Test" }), false);
  });

  it("das Team sieht Details immer — auch ohne Einwilligung und ohne hinterlegten Namen", () => {
    const admin = src("app/(admin)/admin/bewerbungen/BewerbungsListe.tsx");
    assert.match(admin, /<BewerbungDetails application=\{z\} t=\{tBewerbung\} verdeckt=\{false\} \/>/);
    // „Name nicht freigegeben“ wäre im Team-Blick falsch: fehlt ein Name, ist er nicht hinterlegt.
    assert.match(admin, /z\.display_name \?\? z\.email \?\? t\.noName/);
    assert.doesNotMatch(admin, /hiddenName/);
    // Im Partner-Portal entscheidet weiter der Datenstand.
    assert.doesNotMatch(src("components/partner/ApplicantList.tsx"), /verdeckt=\{false\}/);
  });

  it("Partner-Portal und Admin nutzen dieselben Details und Statusfarben", () => {
    const partner = src("components/partner/ApplicantList.tsx");
    const admin = src("app/(admin)/admin/bewerbungen/BewerbungsListe.tsx");
    for (const datei of [partner, admin]) {
      assert.match(datei, /<BewerbungDetails application=/);
      assert.match(datei, /BEWERBUNG_STATUS_TON\[/);
    }
  });

  it("jeder Stand, den die Liste filtert, hat eine Farbe", () => {
    const liste = sql().match(/p_status not in \(([^)]*)\) then\s+raise exception 'invalid_status'/);
    assert.ok(liste, "invalid_status mit Liste in applications_admin_list");
    const staende = liste[1].split(",").map((s) => s.trim().replace(/'/g, ""));
    assert.equal(staende.length, 11);
    assert.deepEqual(staende.filter((s) => !(s in BEWERBUNG_STATUS_TON)), []);
  });
});

describe("Texte DE und EN", () => {
  const benutzt = (datei: string, praefix: string) =>
    [...src(datei).matchAll(new RegExp(`\\b${praefix}\\.([a-zA-Z_]+)\\b`, "g"))].map((m) => m[1]);

  it("jeder Schlüssel der Seiten steht in beiden Sprachen", () => {
    const schluessel = new Set([
      ...benutzt("app/(admin)/admin/bewerbungen/page.tsx", "a"),
      ...benutzt("app/(admin)/admin/bewerbungen/sessions/page.tsx", "a"),
      ...benutzt("app/(admin)/admin/bewerbungen/BewerbungsFilter.tsx", "t"),
      ...benutzt("app/(admin)/admin/bewerbungen/BewerbungsListe.tsx", "t").filter((k) => k !== "cancel"),
    ]);
    assert.ok(schluessel.size > 30, `nur ${schluessel.size} Schlüssel gefunden — Muster prüfen`);
    for (const [sprache, dict] of [
      ["de", de],
      ["en", en],
    ] as const) {
      const a = dict.admin.applications as Record<string, string>;
      const fehlt = [...schluessel].filter((k) => typeof a[k] !== "string" || a[k] === "");
      assert.deepEqual(fehlt, [], `${sprache}: admin.applications`);
    }
  });

  it("too_many_applications hat eine Meldung in beiden Sprachen", () => {
    assert.match(de.rpc.too_many_applications, /200/);
    assert.match(en.rpc.too_many_applications, /200/);
  });
});
