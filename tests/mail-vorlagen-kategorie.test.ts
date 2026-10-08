import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { ADMIN_SECTIONS } from "@/lib/admin-sections";
import {
  KATEGORIE_ABSCHNITT,
  KATEGORIE_ADRESSE,
  MAIL_KATEGORIEN,
  istMailKategorie,
  kategorieAusAdresse,
} from "@/lib/mail/kategorien";
import { einsetzen, passt, platzhalter, unbekanntePlatzhalter, type Vorlage } from "@/lib/mail/vorlagen";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const de = JSON.parse(lies("lib/i18n/de.json")) as { adminMailTemplates: Record<string, string>; admin: { nav: Record<string, string> } };
const en = JSON.parse(lies("lib/i18n/en.json")) as typeof de;

function alleMigrationen(): string[] {
  const dir = join("supabase", "migrations");
  const ordner = [dir, join(dir, "vorschlag")];
  return ordner.flatMap((o) =>
    existsSync(o) ? readdirSync(o).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(join(o, f), "utf8")) : [],
  );
}

/** Schlüssel, die irgendeine Migration in `mail_template` anlegt (`insert into mail_template (key, locale, …) values ('k', 'de', …)`). */
function angelegteSchluessel(): Set<string> {
  const keys = new Set<string>();
  for (const sql of alleMigrationen()) {
    const ohneKommentar = sql.replace(/^\s*--.*$/gm, "");
    for (const m of ohneKommentar.matchAll(/insert\s+into\s+mail_template\s*\(([^)]*)\)([\s\S]*?);/gi)) {
      if (!/\bkey\b/.test(m[1])) continue;
      for (const k of m[2].matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'(?:de|en)'/g)) keys.add(k[1]);
    }
  }
  return keys;
}

const sql = () => migrationText("v6_mail_vorlagen_kategorie");

/** Die Zeilen von `insert into mail_template_key … values …` in der Migration: Schlüssel → Kategorie. */
function zuordnung(): Map<string, string> {
  const text = sql();
  const von = text.indexOf("insert into mail_template_key");
  const bis = text.indexOf("on conflict (key) do nothing", von);
  const out = new Map<string, string>();
  for (const m of text.slice(von, bis).matchAll(/^\s*\('([a-z0-9_]+)',\s*'([a-z]+)'/gm)) out.set(m[1], m[2]);
  return out;
}

describe("Mail-Vorlagen: Zuordnung (ADM-102)", () => {
  it("jede Vorlage, die eine Migration anlegt, hat eine Kategorie — sonst gälte sie als System und ein Bereich käme nicht heran", () => {
    const angelegt = angelegteSchluessel();
    assert.ok(angelegt.size >= 40, `zu wenige Vorlagen gefunden (${angelegt.size}) — stimmt das Muster noch?`);
    const z = zuordnung();
    const ohne = [...angelegt].filter((k) => !z.has(k)).sort();
    assert.deepEqual(ohne, [], `ohne Zeile in mail_template_key (ergänze sie in der Migration oder per set_mail_template_meta): ${ohne.join(", ")}`);
  });

  it("jede Zeile hat eine bekannte Kategorie, und die Zählung stimmt mit dem Vorschlag", () => {
    const z = zuordnung();
    const zaehler: Record<string, number> = {};
    for (const [, k] of z) {
      assert.ok(istMailKategorie(k), `unbekannte Kategorie ${k}`);
      zaehler[k] = (zaehler[k] ?? 0) + 1;
    }
    assert.deepEqual(zaehler, { speaker: 14, partner: 11, participant: 7, volunteer: 6, system: 5 });
  });

  it("SQL und Code ordnen dieselbe Kategorie demselben Abschnitt zu", () => {
    const text = sql();
    for (const [kategorie, abschnitt] of Object.entries(KATEGORIE_ABSCHNITT)) {
      if (kategorie === "system") {
        assert.match(text, /else 'mail' end/);
        continue;
      }
      assert.match(text, new RegExp(`when '${kategorie}' then '${abschnitt}'`), kategorie);
    }
  });

  it("die vier Bereichsabschnitte stehen im Code mit eigenem, zur Adresse passendem Pfad", () => {
    for (const [kategorie, slug] of Object.entries(KATEGORIE_ADRESSE)) {
      const abschnitt = ADMIN_SECTIONS.find((s) => s.key === KATEGORIE_ABSCHNITT[kategorie as keyof typeof KATEGORIE_ADRESSE]);
      assert.ok(abschnitt, kategorie);
      assert.equal(abschnitt!.path, `/admin/mail/vorlagen/${slug}`);
      assert.ok(abschnitt!.roles.length > 0, "ein Bereichsabschnitt ohne Rolle wäre nur für admin");
      assert.equal(kategorieAusAdresse(slug), kategorie);
    }
    assert.equal(kategorieAusAdresse("gibt-es-nicht"), null);
    assert.equal([...MAIL_KATEGORIEN].length, 5);
  });

  it("die Tabelle ist nur über Funktionen erreichbar, und jede Funktion prüft das Recht je Schlüssel", () => {
    const text = sql();
    assert.match(text, /alter table mail_template_key enable row level security/);
    assert.match(text, /revoke all on mail_template_key from anon, authenticated/);
    for (const fn of ["upsert_mail_template", "mail_template_history", "restore_mail_template", "upsert_mail_template_pair", "set_mail_template_meta"]) {
      const von = text.indexOf(`function ${fn}(`);
      assert.ok(von >= 0, fn);
      const rumpf = text.slice(von, text.indexOf("end $$;", von));
      assert.match(rumpf, /can_edit_mail_template\(/, `${fn}: Recht je Schlüssel`);
      assert.ok(!/has_role\('admin'\)/.test(rumpf), `${fn}: kein pauschales admin mehr`);
    }
    const meta = text.slice(text.indexOf("function set_mail_template_meta("));
    assert.match(meta, /has_admin_section\('mail'\)/, "Kategorie und Platzhalter nur admin");
    assert.match(text.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("Mail-Vorlagen: Hilfen der Seite (ADM-102)", () => {
  const vorlage = (p: Partial<Vorlage>): Vorlage => ({
    key: "k", category: "partner", name_de: "Eingang", name_en: "Receipt", variables: [], description: null,
    de: { subject: "Hallo {{first_name}}", body_md: "Text", active: true, version: 1, updated_at: "2026-10-08", updated_by_name: null },
    en: null, queued: 0, sent_30d: 0, sort_order: 0, ...p,
  });

  it("Platzhalter werden klein, ohne Doppelte und ohne Leerzeichen gelesen", () => {
    assert.deepEqual(platzhalter("A {{First_Name}} und {{ portal_url }} und {{first_name}}"), ["first_name", "portal_url"]);
    assert.deepEqual(platzhalter("kein Platzhalter {nicht}"), []);
  });

  it("unbekannt ist, was die Vorlage nicht vorsieht", () => {
    assert.deepEqual(unbekanntePlatzhalter("{{first_name}} {{vorname}}", ["First_Name", "portal_url"]), ["vorname"]);
    assert.deepEqual(unbekanntePlatzhalter("nichts", []), []);
  });

  it("die Suche findet Name, Schlüssel, Betreff und Text beider Sprachen; jedes Wort muss vorkommen", () => {
    const v = vorlage({ en: { subject: "Hello", body_md: "ZusageText", active: true, version: 1, updated_at: "x", updated_by_name: null } });
    assert.equal(passt(v, ""), true);
    assert.equal(passt(v, "eingang"), true);
    assert.equal(passt(v, "RECEIPT"), true);
    assert.equal(passt(v, "zusagetext hallo"), true);
    assert.equal(passt(v, "hallo gibtsnicht"), false);
    assert.equal(passt(v, "k"), true);
  });

  it("der Platzhalter ersetzt die Auswahl und setzt den Cursor dahinter", () => {
    assert.deepEqual(einsetzen("Hallo !", 6, 6, "{{first_name}}"), { text: "Hallo {{first_name}}!", cursor: 20 });
    assert.deepEqual(einsetzen("Hallo Welt", 6, 10, "{{x}}"), { text: "Hallo {{x}}", cursor: 11 });
    assert.deepEqual(einsetzen("ab", 99, 120, "X"), { text: "abX", cursor: 3 }, "Positionen außerhalb werden begrenzt");
  });
});

describe("Mail-Vorlagen: Seiten und Aktionen (ADM-102)", () => {
  it("die Vorlagenseiten ziehen ihr Gate: alle Abschnitte für die Übersicht, genau der eigene je Bereich", () => {
    const uebersicht = lies("app/(admin)/admin/mail/vorlagen/page.tsx");
    assert.match(uebersicht, /requireAnyAdminSection\(/);
    for (const k of ["mail", "mailSpeaker", "mailPartner", "mailParticipants", "mailVolunteers"]) assert.ok(uebersicht.includes(`"${k}"`), k);
    const bereich = lies("app/(admin)/admin/mail/vorlagen/[kategorie]/page.tsx");
    assert.match(bereich, /requireAdminSection\(KATEGORIE_ABSCHNITT\[kategorie\]/);
    assert.match(bereich, /notFound\(\)/, "eine unbekannte Adresse ist eine 404");
  });

  it("die Aktionen verlangen nicht mehr pauschal den Abschnitt mail — die Datenbank entscheidet je Vorlage", () => {
    const a = lies("app/(admin)/admin/mail/vorlagen/actions.ts");
    assert.ok(!/requireAdminSection\("mail"/.test(a));
    assert.match(a, /requireAnyAdminSection\(ABSCHNITTE/);
    assert.match(a, /upsert_mail_template_pair/);
    assert.match(a, /set_mail_template_meta/);
  });

  it("das Protokoll bleibt beim Abschnitt mail, und die Tabs zeigen es nur dort", () => {
    const protokoll = lies("app/(admin)/admin/mail/page.tsx");
    assert.match(protokoll, /requireAdminSection\("mail"/);
    const tabs = lies("app/(admin)/admin/mail/MailTabs.tsx");
    assert.ok(tabs.indexOf("/admin/mail/vorlagen") < tabs.indexOf('href: "/admin/mail"'), "Vorlagen zuerst (ADM-102 b)");
    assert.match(tabs, /mitProtokoll/);
  });

  it("alle Schlüssel der Vorlagenansicht stehen in DE und EN, und die Abschnitte haben Menünamen", () => {
    const keys = new Set([...lies("app/(admin)/admin/mail/vorlagen/VorlagenView.tsx").matchAll(/\bt\.([a-zA-Z]+)\b/g)].map((m) => m[1]));
    for (const k of keys) {
      assert.ok(k in de.adminMailTemplates, `de ${k}`);
      assert.ok(k in en.adminMailTemplates, `en ${k}`);
    }
    for (const k of Object.values(KATEGORIE_ABSCHNITT).filter((x) => x !== "mail")) {
      assert.ok(de.admin.nav[k] && en.admin.nav[k], `Menüname ${k}`);
    }
  });
});
