import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  HIRING_MAX,
  KATEGORIE_AUSGENOMMEN,
  ROLLE_MAX,
  alsOptionen,
  eintragTitel,
  eintragUnterzeile,
  entwurfAus,
  entwurfFehlt,
  hiringOptionen,
  kategorieOptionen,
  kategorieUndBereich,
  leererEntwurf,
  type HiringEintrag,
} from "@/components/partner/hiring";

/**
 * K-94 Stufe 2a (PART-107, Konrad & Leopold 05.10.): „Wen sucht ihr?“ — die Tabelle `org_hiring`, ihre drei Funktionen und die Maske im Partnerportal und im Admin. Die Datenbank belegt
 * `supabase/tests/v6_org_hiring.sql` (37 Erwartungen mit Auswertung, echter Rollenwechsel; Gegenproben 29 von 30, die übrige gleichwertig). Hier steht, was sich ohne Datenbank festhalten
 * lässt: die Regeln der Maske, ihr Gleichlauf mit der Migration (Grenzen, Sperre — aus dem Text gelesen, nicht abgeschrieben), die Form der Migration und die Verdrahtung.
 */
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const migration = () => migrationText("v6_org_hiring");
/** Kommentare raus: ein Satz, der etwas erwähnt, ist keine Anweisung. */
const sqlCode = (sql: string) => sql.replace(/--[^\n]*/g, "");
const tsCode = (ts: string) => ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const woerterbuch = (sprache: string) => JSON.parse(src(`lib/i18n/${sprache}.json`)) as Record<string, Record<string, string>>;

function funktion(sql: string, name: string): string {
  const m = new RegExp(`create or replace function ${name}\\(([\\s\\S]*?)(?=\\ncreate or replace function |\\nselect harden_definer_functions|$)`).exec(sql);
  assert.ok(m, `Funktion ${name} nicht gefunden`);
  return m[0].trimEnd();
}

const eintrag = (o: Partial<HiringEintrag> = {}): HiringEintrag => ({
  id: "h1",
  career_opportunity: "praktikum",
  function_area: "it",
  role_text: null,
  skills: [],
  study_fields: [],
  published: false,
  created_at: "2027-01-01T00:00:00Z",
  updated_at: "2027-01-01T00:00:00Z",
  ...o,
});
const L = { career: { praktikum: "Praktikum", werkstudium: "Werkstudium" }, area: { it: "IT", marketing: "Marketing" } };
const T = { skillOne: "1 Skill", skillMany: "{n} Skills", fieldOne: "1 Studienfach", fieldMany: "{n} Studienfächer" };

describe("K-94 Stufe 2a: Regeln der Maske", () => {
  it("Kategorie und Fachbereich sind Pflicht, die Rolle höchstens 120 Zeichen — Leerzeichen zählen nicht", () => {
    assert.deepEqual(entwurfFehlt(leererEntwurf()), ["career_opportunity", "function_area"]);
    assert.deepEqual(entwurfFehlt({ ...leererEntwurf(), career_opportunity: "  ", function_area: "it" }), ["career_opportunity"]);
    assert.deepEqual(entwurfFehlt({ ...leererEntwurf(), career_opportunity: "praktikum" }), ["function_area"]);
    const ok = { ...leererEntwurf(), career_opportunity: "praktikum", function_area: "it" };
    assert.deepEqual(entwurfFehlt(ok), []);
    assert.deepEqual(entwurfFehlt({ ...ok, role_text: "x".repeat(120) }), []);
    assert.deepEqual(entwurfFehlt({ ...ok, role_text: `  ${"x".repeat(120)}  ` }), [], "getrimmt: 120 Zeichen und Leerzeichen drumherum gehen");
    assert.deepEqual(entwurfFehlt({ ...ok, role_text: "x".repeat(121) }), ["role_text"]);
  });

  it("die Kategorie bietet nicht an, was nur eine Person beschreibt („nicht interessiert“) — in der Reihenfolge des Vokabulars", () => {
    const opt = kategorieOptionen({ praktikum: "Praktikum", "nicht-interessiert": "Ich bin aktuell nicht interessiert an Jobangeboten", trainee: "Trainee" });
    assert.deepEqual(opt, [{ value: "praktikum", label: "Praktikum" }, { value: "trainee", label: "Trainee" }]);
    assert.deepEqual(kategorieOptionen({}), []);
    assert.deepEqual(alsOptionen({ a: "A", b: "B" }), [{ value: "a", label: "A" }, { value: "b", label: "B" }]);
    const alle = hiringOptionen((name) => ({ career_opportunities: { x: "X", "nicht-interessiert": "N" }, function_area: { f: "F" }, skill: { s: "S" }, study_field: { z: "Z" } })[name] ?? {});
    assert.deepEqual(alle, {
      career: [{ value: "x", label: "X" }],
      area: [{ value: "f", label: "F" }],
      skill: [{ value: "s", label: "S" }],
      study: [{ value: "z", label: "Z" }],
    });
  });

  it("Titel: die Rolle, sonst Kategorie und Fachbereich; unbekannte Schlüssel stehen als sie selbst da", () => {
    assert.equal(eintragTitel(eintrag({ role_text: "Werkstudent Data Engineering" }), L), "Werkstudent Data Engineering");
    assert.equal(eintragTitel(eintrag({ role_text: "   " }), L), "Praktikum · IT");
    assert.equal(eintragTitel(eintrag({ role_text: null }), L), "Praktikum · IT");
    assert.equal(kategorieUndBereich(eintrag({ career_opportunity: "alt", function_area: "veraltet" }), L), "alt · veraltet");
  });

  it("Unterzeile: mit Rolle steht Kategorie und Bereich dazu, ohne Rolle nicht doppelt; Ein- und Mehrzahl; nichts zu sagen = leer", () => {
    assert.equal(eintragUnterzeile(eintrag({ role_text: "Werkstudent", skills: ["a", "b"], study_fields: ["z"] }), L, T), "Praktikum · IT · 2 Skills · 1 Studienfach");
    assert.equal(eintragUnterzeile(eintrag({ role_text: "Werkstudent", skills: ["a"], study_fields: ["z", "y", "x"] }), L, T), "Praktikum · IT · 1 Skill · 3 Studienfächer");
    assert.equal(eintragUnterzeile(eintrag({ skills: ["a", "b"] }), L, T), "2 Skills", "ohne Rolle steht Kategorie und Bereich schon oben");
    assert.equal(eintragUnterzeile(eintrag(), L, T), "");
    assert.equal(eintragUnterzeile(eintrag({ role_text: "Rolle" }), L, T), "Praktikum · IT");
  });

  it("der Entwurf eines vorhandenen Eintrags kopiert ihn (keine geteilten Listen), ein neuer ist leer und nicht freigegeben", () => {
    const e = eintrag({ id: "h9", role_text: null, skills: ["a"], study_fields: ["z"], published: true });
    const d = entwurfAus(e);
    assert.deepEqual(d, { id: "h9", career_opportunity: "praktikum", function_area: "it", role_text: "", skills: ["a"], study_fields: ["z"], published: true });
    d.skills.push("b");
    assert.deepEqual(e.skills, ["a"], "die Liste des Eintrags bleibt");
    assert.deepEqual(leererEntwurf(), { id: null, career_opportunity: "", function_area: "", role_text: "", skills: [], study_fields: [], published: false });
  });
});

describe("K-94 Stufe 2a: Maske und Datenbank sagen dasselbe (aus dem Migrationstext gelesen)", () => {
  it("das Limit, die Länge der Rolle und die gesperrte Kategorie stehen in der Funktion wie in der Maske", () => {
    const sql = sqlCode(migration());
    assert.equal(Number(/v_max constant integer := (\d+);/.exec(sql)?.[1]), HIRING_MAX);
    assert.equal(Number(/length\(v_role\) > (\d+)/.exec(sql)?.[1]), ROLLE_MAX);
    assert.equal(Number(/length\(role_text\) <= (\d+)/.exec(sql)?.[1]), ROLLE_MAX, "auch die Prüfung der Tabelle");
    for (const gesperrt of KATEGORIE_AUSGENOMMEN) {
      assert.ok(sql.includes(`v_career = '${gesperrt}'`), `die Funktion sperrt ${gesperrt}`);
      assert.ok(sql.includes(`career_opportunity <> '${gesperrt}'`), `die Tabelle sperrt ${gesperrt}`);
    }
    assert.equal(KATEGORIE_AUSGENOMMEN.length, 1);
  });

  it("die Namen der Parameter, die die Server-Aktion schickt, sind die der Funktion", () => {
    const signatur = /create or replace function set_org_hiring\(([\s\S]*?)\)\s*returns uuid/.exec(migration());
    assert.ok(signatur, "Signatur von set_org_hiring");
    const namen = [...signatur[1].matchAll(/\b(p_[a-z_]+)\s/g)].map((m) => m[1]);
    assert.deepEqual(namen, ["p_org_id", "p_id", "p_career_opportunity", "p_function_area", "p_role_text", "p_skills", "p_study_fields", "p_published", "p_edition_id"]);
    const aufruf = tsCode(src("lib/partner/hiring.ts"));
    for (const n of namen) assert.match(aufruf, new RegExp(`\\b${n}:`), `${n} fehlt im Aufruf`);
    assert.match(aufruf, /rpc\("delete_org_hiring", \{ p_id: id \}\)/);
    assert.match(aufruf, /rpc\("set_org_hiring"/);
    assert.match(src("lib/partner/hiring.ts"), /^import "server-only";/);
  });
});

describe("K-94 Stufe 2a: Migration v6_org_hiring (Quelltext-Prüfung)", () => {
  it("eine Tabelle, genau drei Funktionen — alle SECURITY DEFINER mit gepinntem search_path — und die Härtung am Ende", () => {
    const sql = sqlCode(migration());
    assert.deepEqual([...sql.matchAll(/create table (?:if not exists )?(\w+)/g)].map((m) => m[1]), ["org_hiring"]);
    const namen = [...sql.matchAll(/create or replace function (\w+)\(/g)].map((m) => m[1]);
    assert.deepEqual(namen, ["partner_org_hiring", "set_org_hiring", "delete_org_hiring"]);
    for (const n of namen) {
      const f = funktion(sql, n);
      assert.match(f, /security definer set search_path = public, extensions/, `${n}: definer und search_path`);
    }
    assert.ok(sql.trim().endsWith("select harden_definer_functions();"));
    assert.ok(!migration().includes("$$;;"));
    // Keine bestehende Funktion, keine bestehende Tabelle angefasst.
    assert.doesNotMatch(sql, /\balter table (?!org_hiring)\w+|\bdrop\b|\bcreate or replace function (?!partner_org_hiring|set_org_hiring|delete_org_hiring)/i);
  });

  it("die Tabelle: RLS an, kein Recht für anon und authenticated, keine Policy; Kaskade an der Org-Edition; Freigabe aus", () => {
    const sql = sqlCode(migration());
    assert.match(sql, /alter table org_hiring enable row level security;/);
    assert.match(sql, /revoke all on org_hiring from anon, authenticated;/);
    assert.match(sql, /grant all on org_hiring to service_role;/);
    assert.doesNotMatch(sql, /create policy|grant (select|insert|update|delete)[^;]*to (anon|authenticated)/i);
    assert.match(sql, /org_edition_id\s+uuid not null references org_edition\(id\) on delete cascade/);
    assert.match(sql, /published\s+boolean not null default false/);
  });

  it("jeder Weg prüft zuerst die Anmeldung, dann das Recht; Ändern prüft erst den vorhandenen Eintrag, dann die neuen Werte", () => {
    const sql = sqlCode(migration());
    for (const n of ["partner_org_hiring", "set_org_hiring", "delete_org_hiring"]) {
      const f = funktion(sql, n);
      assert.ok(f.indexOf("current_person_id() is null") >= 0 && f.indexOf("current_person_id() is null") < f.indexOf("42501"), `${n}: Anmeldung vor Recht`);
    }
    const s = funktion(sql, "set_org_hiring");
    assert.match(s, /not partner_can_edit\(p_org_id\)/);
    assert.ok(s.indexOf("v_row.org_edition_id <> v_oe.id") > 0 && s.indexOf("v_row.org_edition_id <> v_oe.id") < s.indexOf("invalid_hiring"), "fremder Eintrag vor jeder Wertprüfung");
    assert.match(funktion(sql, "partner_org_hiring"), /is_partner_of\(p_org_id\) or is_partner_team\(\)/);
    assert.match(funktion(sql, "delete_org_hiring"), /not partner_can_edit\(v_org\)/);
    // Das Limit wird unter der Sperre der Org-Edition gezählt.
    assert.ok(s.indexOf("for update;") < s.indexOf("count(*)::integer into v_n"), "erst sperren, dann zählen");
  });

  it("das Audit trägt keinen Freitext und keine Person: weder die Rolle noch `created_by`, nur Schlüssel und Zahlen", () => {
    const sql = sqlCode(migration());
    for (const m of sql.matchAll(/perform log_audit\(([\s\S]*?)\);\n/g)) {
      assert.doesNotMatch(m[1], /v_role|role_text|created_by|current_person_id|email/, m[1].slice(0, 60));
    }
    assert.equal([...sql.matchAll(/perform log_audit\(/g)].length, 2, "Anlegen/Ändern und Entfernen");
    assert.match(sql, /log_audit\('partner\.org_hiring', 'org_edition'/);
    assert.match(sql, /log_audit\('partner\.org_hiring_remove', 'org_edition'/);
  });

  it("jeder Fehlerschlüssel der Funktionen ist bekannt (BUSINESS_KEYS) und steht in beiden Wörterbüchern", () => {
    const sql = sqlCode(migration());
    const schluessel = new Set([...sql.matchAll(/raise exception '([a-z_ ]+)'/g)].map((m) => m[1]));
    for (const erwartet of ["not authenticated", "not allowed", "invalid_hiring", "invalid_vocab", "too_many_hiring", "hiring_not_found", "org_edition_not_found"]) {
      assert.ok(schluessel.has(erwartet), `${erwartet} fehlt in der Migration`);
    }
    const bekannt = src("lib/rpc-error.ts");
    const de = woerterbuch("de").rpc;
    const en = woerterbuch("en").rpc;
    for (const k of [...schluessel].filter((x) => !x.includes(" "))) {
      assert.match(bekannt, new RegExp(`"${k}",`), `${k} fehlt in BUSINESS_KEYS`);
      assert.equal(typeof de[k], "string", `de.rpc.${k}`);
      assert.equal(typeof en[k], "string", `en.rpc.${k}`);
    }
  });
});

describe("K-94 Stufe 2a: die Maske und ihre Verdrahtung", () => {
  const maske = src("components/partner/WenSuchtIhr.tsx");

  it("Skill-Regel 13: Hinzufügen in der Kopfzeile erst mit Liste, vorher der Leerzustand; Bearbeiten in der Zeile mit Bezug; Fehler im Schubfach", () => {
    assert.match(maske, /canEdit && !voll && eintraege\.length > 0 \?/);
    assert.match(maske, /eintraege\.length === 0 \? \(\s*\/\/[^\n]*\n\s*<div className="flex flex-col items-start gap-3">\s*<p className="ct-help">\{t\.emptyBody\}<\/p>\s*\{canEdit && \(/);
    assert.match(maske, /aria-label=\{`\$\{t\.edit\}: \$\{titel\}`\}/);
    assert.match(maske, /<Drawer[\s\S]*?error=\{fehler\}/);
    assert.match(maske, /<ConfirmDialog[\s\S]*?error=\{entfernenFehler\}/);
    assert.match(maske, /ev\.preventDefault\(\);\s*speichern\(\);/);
    assert.match(maske, /disabled=\{fehlt\.length > 0\}/);
    assert.match(maske, /\{voll && <p className="ct-help mt-4">\{t\.limit\.replace\("\{max\}", String\(HIRING_MAX\)\)\}<\/p>\}/);
  });

  it("die Maske kennt keine Server-Aktion und keinen Service-Schlüssel — sie nimmt `save` und `remove` als Eigenschaften", () => {
    const code = tsCode(maske);
    assert.doesNotMatch(code, /from "\.\.\/\.\.\/app|actions"|service_role|createSupabase/);
    assert.match(code, /save: \(input: HiringSpeichern\) => Promise<HiringErgebnis<\{ id: string \}>>;/);
    assert.match(code, /remove: \(id: string\) => Promise<HiringErgebnis>;/);
  });

  it("Partnerportal: „Eure Daten“ liest die Einträge mit der RPC und gibt die Portal-Aktionen herein; schreiben darf, wer die Seite bearbeiten darf", () => {
    const seite = src("app/(partner)/partner/onboarding/page.tsx");
    assert.match(seite, /supabase\.rpc\("partner_org_hiring", \{\s*p_org_id: current\.org_id,\s*p_edition_id: current\.edition_id,\s*\}\)/);
    assert.match(seite, /canEdit=\{editable\}/);
    assert.match(seite, /save=\{saveOrgHiring\}/);
    assert.match(seite, /remove=\{deleteOrgHiring\}/);
    assert.match(seite, /optionen=\{hiringOptionen\(\(name\) => vgroup\(vocab, name\)\)\}/);
    const aktionen = tsCode(src("app/(partner)/partner/actions.ts"));
    assert.match(aktionen, /export async function saveOrgHiring\(input: HiringSpeichern\)[\s\S]*?hiringSpeichern\(await client\(\), input\)/);
    assert.match(aktionen, /export async function deleteOrgHiring\(id: string\)[\s\S]*?hiringEntfernen\(await client\(\), id\)/);
  });

  it("Admin-Vollständigkeit: dieselbe Maske unter der Organisation, mit den Admin-Aktionen, dieselben RPCs; die Navigation führt den Abschnitt nur mit Edition", () => {
    const seite = src("app/(admin)/admin/partner/[org]/page.tsx");
    assert.match(seite, /supabase\.rpc\("partner_org_hiring", \{ p_org_id: org \}\)/);
    assert.match(seite, /hiring=\{\{\s*eintraege: \(hiringZeilen \?\? \[\]\) as HiringEintrag\[\],\s*optionen: hiringOptionen\(\(name\) => vgroup\(vocab, name\)\),\s*texts: t\.partnerHiring,\s*\}\}/);
    const detail = src("app/(admin)/admin/partner/[org]/OrgDetail.tsx");
    assert.match(detail, /<WenSuchtIhr\s+id="hiring"/);
    assert.match(detail, /save=\{adminSaveOrgHiring\}/);
    assert.match(detail, /remove=\{adminDeleteOrgHiring\}/);
    assert.match(detail, /\.\.\.\(editionId \? \[\{ id: "hiring", label: hiring\.texts\.title \}\] : \[\]\)/);
    assert.match(detail, /\{editionId && \(\s*<WenSuchtIhr/);
    const aktionen = tsCode(src("app/(admin)/admin/partner/actions.ts"));
    assert.match(aktionen, /export async function adminSaveOrgHiring\(input: HiringSpeichern\)[\s\S]*?hiringSpeichern\(await client\(\), input\)/);
    assert.match(aktionen, /export async function adminDeleteOrgHiring\(id: string\)[\s\S]*?hiringEntfernen\(await client\(\), id\)/);
  });
});

describe("K-94 Stufe 2a: Texte", () => {
  it("jeder Text der Maske steht in beiden Wörterbüchern; Platzhalter und Ihr-Ansprache stimmen", () => {
    const code = src("components/partner/WenSuchtIhr.tsx");
    const benutzt = [...new Set([...code.matchAll(/\bt\.([a-zA-Z]+)/g)].map((m) => m[1]))].filter((k) => k !== "replace");
    const erwartet = [...new Set([...benutzt, "skillOne", "skillMany", "fieldOne", "fieldMany"])];
    assert.ok(erwartet.length >= 30, `nur ${erwartet.length} Schlüssel gefunden`);
    for (const sprache of ["de", "en"]) {
      const w = woerterbuch(sprache).partnerHiring;
      for (const k of erwartet) assert.equal(typeof w[k], "string", `${sprache}: partnerHiring.${k}`);
      assert.match(w.fieldRoleHint, /\{max\}/);
      assert.match(w.limit, /\{max\}/);
      assert.match(w.roleTooLong, /\{max\}/);
      assert.match(w.skillMany, /\{n\}/);
      assert.match(w.fieldMany, /\{n\}/);
      assert.match(w.removeBody, /\{name\}/);
    }
    const de = woerterbuch("de").partnerHiring;
    for (const [k, v] of Object.entries(de)) assert.doesNotMatch(v, /\bSie\b|\bIhr\b|\bIhre\b|\bIhnen\b/, `partnerHiring.${k}`);
    assert.equal(de.title, "Wen sucht ihr?");
  });
});

describe("K-94 Stufe 2a: Testdaten für Konrads Konto und Doku", () => {
  const skript = src("scripts/testdaten-konrad.mjs");

  it("der Schritt hiring ist angemeldet, kennzeichnet seine Einträge, wartet auf die Tabelle und räumt sie weg", () => {
    assert.match(skript, /hiring: hiringSchritt,/);
    assert.match(skript, /--apply --nur=hiring\s+\(K-94 Stufe 2a\/PART-107:/);
    const liste = /const HIRING_EINTRAEGE = \[([\s\S]*?)\n\];/.exec(skript);
    assert.ok(liste, "HIRING_EINTRAEGE fehlt");
    const rollen = [...liste[1].matchAll(/rolle: `([^`]+)`/g)].map((m) => m[1]);
    assert.equal(rollen.length, 3);
    for (const r of rollen) assert.ok(r.startsWith("ZZTEST — "), `${r}: nicht gekennzeichnet`);
    assert.equal([...liste[1].matchAll(/frei: true/g)].length, 1, "einer freigegeben, zwei nicht");
    // Ohne Migration meldet der Schritt es und schreibt nichts.
    assert.match(skript, /probe\.code === "PGRST205" \|\| probe\.code === "42P01"\)\) return fail\("Wen sucht ihr\?", "Tabelle org_hiring fehlt/);
    // Kategorie ohne „nicht-interessiert“ (sonst lehnte die Tabelle die Zeile ab).
    assert.match(skript, /werte\("career_opportunities", \["nicht-interessiert"\]\)/);
    // Aufräumen: nur die gekennzeichneten, und eine fehlende Tabelle ist kein Fehler.
    assert.match(skript, /from\("org_hiring"\)\.delete\(\)\.like\("role_text", "ZZTEST — %"\)/);
    assert.match(skript, /r\.error\.code === "PGRST205" \|\| r\.error\.code === "42P01"\)\) return \{ data: null, error: null \}/);
  });

  it("Doku: der Testdaten-Absatz nennt Schritt, Voraussetzung und Klickweg (Partnerportal und Admin)", () => {
    const doc = src("docs/testdaten-konrad.md");
    assert.match(doc, /\*\*Wen sucht ihr\? \(K-94 Stufe 2a, PART-107\):\*\* `--apply --nur=hiring` \(braucht `partner`; \*\*erst nach „Migration live“\*\* von `v6_org_hiring`/);
    assert.match(doc, /`\/partner\/onboarding` ganz unten/);
    assert.match(doc, /`\/admin\/partner\/<Test-Organisation>` — derselbe Abschnitt/);
  });
});
