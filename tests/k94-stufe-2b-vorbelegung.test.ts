import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { HiringEintrag } from "@/components/partner/hiring";
import {
  HIRING_PROFIL_FELDER,
  detailsMitProfil,
  eintragOptionen,
  profilAusDetails,
  profilAusEintrag,
  profilGleich,
  profilLeer,
  profilMitEintrag,
} from "@/components/partner/hiring-uebernehmen";
import { PROFIL_FELDER, type Zielprofil } from "@/components/partner/profil";

/**
 * K-94 Stufe 2b (PART-140, Plan 10.10.2026): „Aus ‚Wen sucht ihr?‘ übernehmen“ — ein Eintrag der Organisation füllt das Wunschprofil von Masterclass, Stopp der Company Tour und
 * Interview Table **vor** (Vorbelegung statt Verweis: das Format behält sein eigenes `target_profile`). Die reine Logik, die Verdrahtung der Masken, die Lader und die Texte.
 */

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const json = (p: string) => JSON.parse(src(p)) as Record<string, Record<string, unknown>>;
/** Kommentare raus: ein Satz, der etwas erwähnt, ist keine Anweisung. */
const tsCode = (ts: string) => ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const eintrag = (o: Partial<HiringEintrag> = {}): HiringEintrag => ({
  id: "h1",
  career_opportunity: "werkstudium",
  function_area: "data_ai",
  role_text: "Werkstudent:in Data Engineering",
  skills: ["data_analysis", "programming"],
  study_fields: ["wirtschaftsinformatik"],
  published: false,
  created_at: "2027-01-01T00:00:00Z",
  updated_at: "2027-01-01T00:00:00Z",
  ...o,
});

describe("K-94 Stufe 2b: das Profil, das ein Eintrag beschreibt", () => {
  it("Kategorie und Fachbereich als je ein Schlüssel, Skills und Studienfelder als Listen — eine Kopie, leere Felder fehlen", () => {
    const e = eintrag();
    const p = profilAusEintrag(e);
    assert.deepEqual(p, {
      career_opportunities: ["werkstudium"],
      function_area: ["data_ai"],
      skill: ["data_analysis", "programming"],
      study_field: ["wirtschaftsinformatik"],
    });
    p.skill!.push("x");
    p.study_field!.push("y");
    assert.deepEqual(e.skills, ["data_analysis", "programming"], "die Liste des Eintrags wird nicht geteilt");
    assert.deepEqual(e.study_fields, ["wirtschaftsinformatik"], "auch die der Studienfelder nicht");
    const leer = profilAusEintrag(eintrag({ skills: [], study_fields: [] }));
    assert.deepEqual(leer, { career_opportunities: ["werkstudium"], function_area: ["data_ai"] });
    assert.ok(!("skill" in leer) && !("study_field" in leer), "nichts Leeres im Profil");
    assert.deepEqual(profilAusEintrag(eintrag({ career_opportunity: "  ", function_area: "" })), { skill: ["data_analysis", "programming"], study_field: ["wirtschaftsinformatik"] });
  });

  it("nach „Übernehmen“ ersetzen die vier Felder des Eintrags die des Formats — auch dort, wo der Eintrag nichts hat; der Status bleibt", () => {
    const vorher: Zielprofil = { occupation_status: ["student"], skill: ["strategy"], study_field: ["business"], function_area: ["legal"], career_opportunities: ["trainee"] };
    const danach = profilMitEintrag(vorher, eintrag());
    assert.deepEqual(danach, {
      occupation_status: ["student"],
      career_opportunities: ["werkstudium"],
      function_area: ["data_ai"],
      skill: ["data_analysis", "programming"],
      study_field: ["wirtschaftsinformatik"],
    });
    // Ein Eintrag ohne Skills und Studienfelder ist „offen für alle“ — das Alte bleibt nicht stehen.
    const ohne = profilMitEintrag(vorher, eintrag({ skills: [], study_fields: [] }));
    assert.deepEqual(ohne, { occupation_status: ["student"], career_opportunities: ["werkstudium"], function_area: ["data_ai"] });
    // Die Eingabe bleibt unverändert, auch ihre Listen.
    assert.deepEqual(vorher.skill, ["strategy"]);
    assert.ok(HIRING_PROFIL_FELDER.every((f) => (PROFIL_FELDER as readonly string[]).includes(f)), "nur Felder, die das Wunschprofil kennt");
    assert.ok(!HIRING_PROFIL_FELDER.includes("occupation_status"), "der Status gehört dem Format");
  });

  it("ein leeres Profil bleibt mit „Übernehmen“ nicht leer, und zweimal übernehmen ändert nichts", () => {
    const einmal = profilMitEintrag({}, eintrag());
    assert.ok(!profilLeer(einmal));
    assert.ok(profilGleich(profilMitEintrag(einmal, eintrag()), einmal));
  });
});

describe("K-94 Stufe 2b: Vergleich, Details und Auswahl", () => {
  it("gleich ist, was in jedem Feld dieselben Schlüssel hat — Reihenfolge, Dubletten und leere Felder zählen nicht", () => {
    assert.equal(profilGleich({}, {}), true);
    assert.equal(profilGleich({ skill: ["a", "b"] }, { skill: ["b", "a"] }), true);
    assert.equal(profilGleich({ skill: ["b", "a"] }, { skill: ["a", "b"] }), true, "in beide Richtungen");
    assert.equal(profilGleich({ skill: ["a", "a"] }, { skill: ["a"] }), true);
    assert.equal(profilGleich({ skill: [] }, {}), true);
    assert.equal(profilGleich({ skill: ["a"] }, {}), false);
    assert.equal(profilGleich({}, { skill: ["a"] }), false, "auch wenn nur die rechte Seite ein Feld hat");
    assert.equal(profilGleich({ skill: ["a"] }, { skill: ["b"] }), false);
    assert.equal(profilGleich({ skill: ["a"] }, { skill: ["a", "b"] }), false);
    assert.equal(profilGleich({ skill: ["a"] }, { study_field: ["a"] }), false, "dasselbe Wort in einem anderen Feld ist etwas anderes");
    assert.equal(profilLeer({}), true);
    assert.equal(profilLeer({ skill: [] }), true);
    assert.equal(profilLeer({ skill: ["a"] }), false);
  });

  it("die Details einer Session: alle anderen Angaben bleiben, das Profil ersetzt das alte, ein leeres nimmt den Schlüssel heraus", () => {
    const details = { goodies_planned: true, image_asset_id: "a1", job_title: "Dev", target_profile: { skill: ["strategy"] } };
    const neu = detailsMitProfil(details, { skill: ["programming"], function_area: [], career_opportunities: ["praktikum"] });
    assert.deepEqual(neu, { goodies_planned: true, image_asset_id: "a1", job_title: "Dev", target_profile: { skill: ["programming"], career_opportunities: ["praktikum"] } });
    assert.deepEqual(details.target_profile, { skill: ["strategy"] }, "die Eingabe bleibt unverändert");
    const leer = detailsMitProfil(details, {});
    assert.deepEqual(leer, { goodies_planned: true, image_asset_id: "a1", job_title: "Dev" });
    assert.ok(!("target_profile" in leer));
    // Auch die Listen des Ergebnisses gehören ihm allein: wer sie ändert, ändert den Entwurf der Maske nicht.
    const entwurf: Zielprofil = { skill: ["a"] };
    const ergebnis = detailsMitProfil({}, entwurf);
    (ergebnis.target_profile as Zielprofil).skill!.push("z");
    assert.deepEqual(entwurf.skill, ["a"]);
    assert.deepEqual(detailsMitProfil(null, { skill: ["x"] }), { target_profile: { skill: ["x"] } });
    assert.deepEqual(detailsMitProfil(undefined, {}), {});
  });

  it("das gespeicherte Profil aus den Details: nur Listen von Texten, alles andere wird ignoriert", () => {
    assert.deepEqual(profilAusDetails({ target_profile: { skill: ["a", "b"], function_area: ["c"] } }), { skill: ["a", "b"], function_area: ["c"] });
    assert.deepEqual(profilAusDetails({ target_profile: { skill: ["a", 3, null, "b"], study_field: [], function_area: "c" } }), { skill: ["a", "b"] });
    for (const kaputt of [null, undefined, {}, { target_profile: null }, { target_profile: ["a"] }, { target_profile: [["a"]] }, { target_profile: "a" }, { target_profile: 3 }]) {
      assert.deepEqual(profilAusDetails(kaputt as Record<string, unknown> | null | undefined), {}, JSON.stringify(kaputt));
    }
    // Rundlauf
    const p: Zielprofil = { skill: ["a"], career_opportunities: ["praktikum"] };
    assert.ok(profilGleich(profilAusDetails(detailsMitProfil({ goodies_planned: false }, p)), p));
  });

  it("die Auswahl der Einträge: mit Rolle „Rolle — Kategorie · Bereich“, ohne nur „Kategorie · Bereich“, in der Reihenfolge der Anlage, Wert ist die Kennung", () => {
    const l = { career: { werkstudium: "Werkstudium", praktikum: "Praktikum" }, area: { data_ai: "Data & AI", marketing_brand: "Marketing & Brand" } };
    const opt = eintragOptionen(
      [eintrag({ id: "a" }), eintrag({ id: "b", role_text: null, career_opportunity: "praktikum", function_area: "marketing_brand" }), eintrag({ id: "c", role_text: "   ", career_opportunity: "unbekannt", function_area: "data_ai" })],
      l,
    );
    assert.deepEqual(opt, [
      { value: "a", label: "Werkstudent:in Data Engineering — Werkstudium · Data & AI" },
      { value: "b", label: "Praktikum · Marketing & Brand" },
      { value: "c", label: "unbekannt · Data & AI" },
    ]);
    assert.deepEqual(eintragOptionen([], l), []);
  });
});

describe("K-94 Stufe 2b: die Masken", () => {
  it("der Baustein: kein Absenden des Formulars, ohne Auswahl nichts zu übernehmen, ohne Einträge ein Hinweis mit Weg statt einer leeren Auswahl, Ansage für Vorleser", () => {
    const s = tsCode(src("components/partner/HiringUebernehmen.tsx"));
    assert.match(s, /<Button\s+type="button"\s+variant="secondary"\s+disabled=\{disabled \|\| wahl === ""\}/, "kein Submit, sekundär, ohne Auswahl aus");
    assert.match(s, /if \(eintraege\.length === 0\) \{\s+return \(\s+<p className="ct-help">\s+\{t\.applyNone\}\{" "\}\s+<Link href=\{leerHref\} className="ct-link">\s+\{t\.applyNoneLink\}/);
    assert.match(s, /<p role="status"[^>]*>\s*\{uebernommen \? t\.applied : ""\}/);
    assert.match(s, /const e = eintraege\.find\(\(x\) => x\.id === wahl\);\s+if \(!e\) return;\s+onUebernehmen\(e\);/);
    // Der Baustein schreibt nichts: weder Server-Aktion noch Datenbank.
    assert.doesNotMatch(s, /"use server"|supabase|\.rpc\(|from "\.\.\/actions"|app\/\(/);
    assert.match(s, /eintragOptionen\(eintraege,/);
  });

  it("Stopp der Company Tour und Interview Table: die Vorbelegung ersetzt im Entwurf, nur für wen bearbeiten darf, und nur mit `hiring`", () => {
    const tour = tsCode(src("components/partner/TourStopp.tsx"));
    assert.match(tour, /hiring\?: HiringVorbelegung;/);
    assert.match(tour, /vorbelegung=\{\s+canEdit && hiring \? \(\s+<HiringUebernehmen\s+vorbelegung=\{hiring\}\s+felder=\{felder\}\s+onUebernehmen=\{\(e\) => setEntwurf\(\(x\) => \(\{ \.\.\.x, target_profile: profilMitEintrag\(x\.target_profile, e\) \}\)\)\}\s+\/>\s+\) : undefined\s+\}/);
    const tisch = tsCode(src("app/(partner)/partner/interview-tables/TischeView.tsx"));
    assert.match(tisch, /hiring\?: HiringVorbelegung;/);
    assert.match(tisch, /vorbelegung=\{\s+canEdit && hiring \? \(\s+<HiringUebernehmen vorbelegung=\{hiring\} felder=\{profilFelder\} onUebernehmen=\{\(e\) => setProfil\(\(p\) => profilMitEintrag\(p, e\)\)\} \/>\s+\) : undefined\s+\}/);
  });

  it("Masterclass: eine Karte mit dem Wunschprofil, gespeichert wird mit „Speichern“ über die ganzen Details — und nichts, wenn es nichts zu speichern gibt", () => {
    const s = tsCode(src("components/partner/MasterclassProfil.tsx"));
    assert.match(s, /const geaendert = !profilGleich\(profil, basis\);/);
    assert.match(s, /const warnung = useUngesichert\(canEdit && geaendert, unsaved\);/);
    assert.match(s, /function speichern\(\) \{\s+if \(!geaendert\) return;/);
    assert.match(s, /await save\(detailsMitProfil\(details, profil\)\);/);
    assert.match(s, /setBasis\(profil\);\s+toast\("success", t\.saved\);\s+router\.refresh\(\);/);
    assert.match(s, /<Button type="submit" loading=\{saving\} disabled=\{!geaendert\}>/);
    assert.match(s, /\) : \(\s+<p className="ct-help">\{t\.noRights\}<\/p>/, "ohne Recht der Hinweis statt des Knopfs");
    assert.match(s, /onToggle=\{\(feld, key\) => setProfil\(\(p\) => profilUmschalten\(p, feld, key\)\)\}/);
    assert.match(s, /vorbelegung=\{\s+canEdit \? <HiringUebernehmen vorbelegung=\{vorbelegung\} felder=\{felder\} onUebernehmen=\{\(e\) => setProfil\(\(p\) => profilMitEintrag\(p, e\)\)\} \/> : undefined\s+\}/);
    // Fehler stehen im Formular, nicht in einem Toast.
    assert.match(s, /<p role="alert" className="ct-small text-error-ink">/);
    const instanz = tsCode(src("app/(partner)/partner/masterclass/Instanz.tsx"));
    const inhalt = instanz.indexOf("<MasterclassInhalt");
    const profil = instanz.indexOf("<MasterclassProfil");
    const goodies = instanz.indexOf("<GoodiesFrage");
    assert.ok(inhalt > 0 && inhalt < profil && profil < goodies, "Inhalt, Wunschprofil, Goodies in dieser Reihenfolge");
    assert.match(instanz, /<CardHeader ebene="h3" title=\{profilT\.profileTitle\} description=\{profilT\.profileHint\} \/>/);
    assert.match(instanz, /save=\{updateFormatDetails\.bind\(null, x\.id\)\}\s+kopf=\{false\}/);
  });

  it("der gemeinsame Baustein der Fragen: ohne die neuen Zutaten sieht er aus wie vorher (Kopf an, nichts dazwischen)", () => {
    const s = tsCode(src("components/partner/ProfilAuswahl.tsx"));
    assert.match(s, /kopf = true,/);
    assert.match(s, /\{kopf && \(\s+<>\s+<h3 className="ct-label text-ink">\{t\.profileTitle\}<\/h3>\s+<p className="ct-help mt-1">\{t\.profileHint\}<\/p>\s+<\/>\s+\)\}/);
    assert.match(s, /\{vorbelegung && <div className=\{kopf \? "mt-3" : undefined\}>\{vorbelegung\}<\/div>\}/);
  });

  it("Admin-Vollständigkeit: der Stopp trägt die Vorbelegung, die Masterclasses haben ihre Karte — dieselbe Maske, dieselbe RPC", () => {
    const s = tsCode(src("app/(admin)/admin/partner/[org]/OrgDetail.tsx"));
    assert.match(s, /hiring=\{\{ eintraege: hiring\.eintraege, t: hiring\.texts, leerHref: "#hiring" \}\}/);
    assert.match(s, /<Card id="wunschprofil">\s+<CardHeader ebene="h2" title=\{t\.masterclassProfileTitle\} description=\{t\.masterclassProfileLead\} \/>/);
    assert.match(s, /<MasterclassProfil\s+details=\{x\.format_details\}\s+felder=\{tourFelder\}\s+vorbelegung=\{\{ eintraege: hiring\.eintraege, t: hiring\.texts, leerHref: "#hiring" \}\}\s+canEdit\s+save=\{\(details\) => adminUpdateFormatDetails\(x\.id, details\)\}\s+kopf=\{false\}/);
    // Der Anker, zu dem der Hinweis ohne Einträge führt, steht im Admin (`id="hiring"`, Stufe 2a) und im Partnerportal.
    assert.match(s, /id="hiring"/);
    assert.match(tsCode(src("app/(partner)/partner/onboarding/page.tsx")), /<WenSuchtIhr\s+id="hiring"/);
  });
});

describe("K-94 Stufe 2b: die Seiten laden die Einträge, die Texte stehen in beiden Sprachen", () => {
  it("der Lader: Sitzungs-Client, die RPC der Stufe 2a, ein Fehler lässt die Seite nicht fallen", () => {
    const s = tsCode(src("lib/partner/hiring-laden.ts"));
    assert.match(s, /^import "server-only";/m);
    assert.match(s, /supabase\.rpc\("partner_org_hiring", \{ p_org_id: orgId, p_edition_id: editionId \}\)/);
    assert.match(s, /if \(error\) \{\s+if \(error\.code !== "42501"\) console\.error\([^)]*\);\s+return \[\];\s+\}/);
    assert.doesNotMatch(s, /service|admin|SECRET/i);
  });

  it("Masterclass, Company Tour und Interview Table laden die Einträge der eigenen Organisation und geben sie mit den Texten an die Maske", () => {
    for (const [p, ziel] of [
      ["app/(partner)/partner/masterclass/page.tsx", "ladeHiring(supabase, current.org_id, current.edition_id)"],
      ["app/(partner)/partner/company-tour/page.tsx", "ladeHiring(supabase, current.org_id, current.edition_id)"],
      ["app/(partner)/partner/interview-tables/page.tsx", "ladeHiring(supabase, current.org_id, current.edition_id)"],
    ] as const) {
      const s = tsCode(src(p));
      assert.ok(s.includes(ziel), `${p}: lädt die Einträge der Organisation`);
      assert.match(s, /hiring=\{\{ eintraege: hiring, t: t\.partnerHiring, leerHref: "\/partner\/onboarding#hiring" \}\}/, `${p}: gibt Einträge und Texte weiter`);
      assert.match(s, /import \{ ladeHiring \} from "@\/lib\/partner\/hiring-laden";/, p);
    }
    assert.match(tsCode(src("app/(partner)/partner/company-tour/daten.ts")), /t,\s+current,\s+stopps,/, "der Lader der Tour gibt die Organisation mit zurück");
    assert.match(tsCode(src("app/(partner)/partner/masterclass/page.tsx")), /profilFelder=\{profilFelderAus\(\(name\) => vgroup\(vocab, name\)\)\}/);
  });

  it("Texte der Vorbelegung und der Admin-Karte in beiden Sprachen; Ihr-Ansprache; die Fragen der Masterclass nehmen die Texte der Tour (dieselben Wörter)", () => {
    for (const sprache of ["de", "en"]) {
      const d = json(`lib/i18n/${sprache}.json`);
      const h = d.partnerHiring as Record<string, string>;
      for (const k of ["applyLabel", "applyChoose", "applyButton", "applyHint", "applied", "applyNone", "applyNoneLink"]) assert.ok(h[k]?.trim(), `${sprache}: partnerHiring.${k}`);
      const a = d.adminPartner as Record<string, string>;
      for (const k of ["masterclassProfileTitle", "masterclassProfileLead"]) assert.ok(a[k]?.trim(), `${sprache}: adminPartner.${k}`);
      const tour = d.partnerTour as Record<string, string>;
      for (const k of ["profileTitle", "profileHint", "profileOpen", "save", "saved", "noRights", ...PROFIL_FELDER.map((f) => `profile_${f}`)]) assert.ok(tour[k]?.trim(), `${sprache}: partnerTour.${k}`);
      const mc = d.partnerMasterclass as Record<string, string>;
      for (const k of ["save", "saved", "noRights"]) assert.ok(mc[k]?.trim(), `${sprache}: partnerMasterclass.${k}`);
    }
    // Ein Name, eine Bedeutung: „Wen sucht ihr?“ ist der Abschnitt der Organisation (Stufe 2a); die Fragen des Formats heißen bei Tour, Masterclass **und** Interview Table gleich —
    // nicht wie der Abschnitt, aus dem sie vorbelegt werden („Aus ‚Wen sucht ihr?‘ übernehmen“ stünde sonst unter einer Überschrift „Wen sucht ihr?“).
    for (const sprache of ["de", "en"]) {
      const d = json(`lib/i18n/${sprache}.json`);
      const abschnitt = (d.partnerHiring as Record<string, string>).title;
      const tour = (d.partnerTour as Record<string, string>).profileTitle;
      const tisch = (d.partnerInterviewTables as Record<string, string>).profileTitle;
      assert.equal(tisch, tour, `${sprache}: Interview Tables und Company Tour nennen die Fragen gleich`);
      assert.notEqual(tour, abschnitt, `${sprache}: der Titel der Fragen ist nicht der des Abschnitts der Organisation`);
    }
    const de = json("lib/i18n/de.json");
    for (const k of ["applyLabel", "applyChoose", "applyButton", "applyHint", "applied", "applyNone", "applyNoneLink"]) {
      assert.doesNotMatch((de.partnerHiring as Record<string, string>)[k], /\bSie\b|\bIhr\b|\bIhre\b|\bIhnen\b/, `partnerHiring.${k}`);
    }
    assert.match((de.partnerHiring as Record<string, string>).applyHint, /Gespeichert wird erst mit „Speichern“/);
    assert.match((de.partnerHiring as Record<string, string>).applyHint, /Status/);
  });
});

describe("K-94 Stufe 2b: Doku", () => {
  it("der Testdaten-Absatz nennt Voraussetzung (Schritt hiring) und den Klickweg in Portal und Admin", () => {
    const doku = src("docs/testdaten-konrad.md");
    const i = doku.indexOf("**Vorbelegung aus „Wen sucht ihr?“ (K-94 Stufe 2b, PART-140):**");
    assert.ok(i > 0, "Absatz zur Vorbelegung fehlt");
    const absatz = doku.slice(i, doku.indexOf("\n\n", i));
    assert.match(absatz, /Schritts `hiring`/);
    for (const weg of ["/partner/masterclass", "/partner/company-tour", "/partner/interview-tables", "/admin/partner/<Test-Organisation>"]) assert.ok(absatz.includes(weg), weg);
    assert.match(absatz, /„Übernehmen“/);
    assert.match(absatz, /Karte „Masterclass: Wunschprofil“/);
    assert.match(absatz, /Status bleibt/);
  });
});
