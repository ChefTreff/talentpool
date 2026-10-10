import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { istVorschlag, migrationText } from "@/tests/migration-datei";

/**
 * K-91 (Konrad 09.10.2026, Befund QS-075): die vier Empfehlungs- und Botschafterfelder `person.invite_code`, `referred_by_person_id`, `is_ambassador`,
 * `engagement_score` sind leer und nie gebaut — gestrichen, mit Zählprobe, und die zwei Funktionen, die sie nannten, ziehen nach. Die Datenbankseite belegt
 * `supabase/tests/v6_k91_empfehlungsfelder_weg.sql` (Spalten, Fremdschlüssel, Index und Grants weg; keine Funktion nennt sie; Zusammenführen und Löschen laufen).
 * Hier steht, was sich ohne Datenbank festhalten lässt: die Migration selbst, der Vergleich mit dem Snapshot (nur, solange sie ein Vorschlag ist) und dass nichts im
 * Quelltext die Spalten noch anfasst.
 */
const NAME = "v6_k91_empfehlungsfelder_weg";
const SPALTEN = ["invite_code", "referred_by_person_id", "is_ambassador", "engagement_score"];
const sql = () => migrationText(NAME);
const code = (text: string) => text.replace(/--[^\n]*/g, "");
const quelle = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function funktion(text: string, name: string): string {
  const von = text.indexOf(`create or replace function ${name}(`);
  assert.ok(von >= 0, `${name} fehlt`);
  const ende = text.indexOf("\nend $$;", von);
  assert.ok(ende > von, `${name}: kein Ende gefunden`);
  return text.slice(von, ende + "\nend $$;".length);
}

function quelltexte(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...quelltexte(p));
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

describe("K-91: die Migration", () => {
  it("prüft zuerst, dass alle vier Spalten leer sind, und bricht sonst ab — erst danach wird gelöscht", () => {
    const c = code(sql());
    assert.match(c, /raise exception 'Spalten nicht leer/);
    assert.match(c, /using errcode = 'P0001'/);
    assert.ok(c.indexOf("raise exception 'Spalten nicht leer") < c.indexOf("drop column"), "Zählprobe vor dem Löschen");
    for (const s of SPALTEN) assert.ok(c.slice(0, c.indexOf("drop column")).includes(s), `${s} wird gezählt`);
    assert.match(c, /count\(\*\) filter \(where is_ambassador\)/, "is_ambassador zählt true, nicht jede Zeile (not null default false)");
  });

  it("löscht genau die vier Spalten von `person` — nichts sonst, kein cascade", () => {
    const c = code(sql());
    const drops = c.match(/^alter table\s+\S+\s+drop column[^;]*;/gm) ?? [];
    assert.equal(drops.length, 1);
    assert.equal(
      drops[0],
      "alter table person drop column invite_code, drop column referred_by_person_id, drop column is_ambassador, drop column engagement_score;",
    );
    assert.doesNotMatch(c, /\bcascade\b/i);
    assert.doesNotMatch(c, /drop table|drop function|drop index|drop constraint/i, "Fremdschlüssel und Index fallen mit der Spalte");
  });

  it("zieht `anonymize_person` und `person_merge_core` nach und endet mit `harden_definer_functions()`", () => {
    const c = code(sql());
    for (const f of ["anonymize_person", "person_merge_core"]) {
      const text = funktion(c, f);
      for (const s of SPALTEN) assert.ok(!text.includes(s), `${f} nennt ${s} noch`);
      assert.match(text, /SECURITY DEFINER/);
      assert.match(text, /SET search_path TO 'public', 'extensions'/);
    }
    assert.match(c.trim(), /select harden_definer_functions\(\);$/);
  });

  it("gegen die Live-Fassung (Snapshot) fallen je Funktion genau die Zeilen mit den vier Spalten — nur, solange die Migration ein Vorschlag ist", { skip: !istVorschlag(NAME) }, () => {
    const anon = quelle("supabase/snapshot/functions/anonymize_person.sql").trim();
    assert.equal(
      funktion(sql(), "anonymize_person").trim(),
      anon.replace("    nationality = null, invite_code = null, auth_user_id = null,\n", "    nationality = null, auth_user_id = null,\n"),
    );
    const merge = quelle("supabase/snapshot/functions/person_merge_core.sql").trim();
    const keepAlt = "                                  'access_blocked_at', 'tier', 'is_ambassador', 'engagement_score',\n                                  'referred_by_person_id', 'source_first'];\n";
    const keepNeu = "                                  'access_blocked_at', 'tier', 'source_first'];\n";
    assert.equal(merge.split(keepAlt).length - 1, 1);
    const von = merge.indexOf("  -- Wer von der zweiten Person geworben wurde");
    const ende = merge.indexOf("  -- Alle übrigen Fremdschlüssel auf person(id)");
    assert.ok(von > 0 && ende > von);
    assert.equal(funktion(sql(), "person_merge_core").trim(), (merge.slice(0, von) + merge.slice(ende)).replace(keepAlt, keepNeu));
  });
});

describe("K-91: nichts im Quelltext fasst die Spalten noch an", () => {
  it("App, Bibliothek, Komponenten und Skripte nennen keine der vier Spalten", () => {
    for (const dir of ["app", "lib", "components", "scripts"]) {
      for (const datei of quelltexte(dir)) {
        const text = readFileSync(datei, "utf8");
        for (const s of SPALTEN) assert.ok(!text.includes(s), `${datei} nennt ${s}`);
      }
    }
  });

  it("die Wörterbücher führen kein Etikett `person.referred_by_person_id` mehr (der Zusammenführen-Bericht kann sie nicht mehr nennen)", () => {
    for (const f of ["lib/i18n/de.json", "lib/i18n/en.json"]) assert.ok(!quelle(f).includes("referred_by_person_id"), f);
  });

  it("der Zusammenführen-Test der Datenbank setzt keine Geworbenen mehr an", () => {
    const t = quelle("supabase/tests/v6_dubletten_zusammenfuehren.sql");
    for (const s of SPALTEN) assert.ok(!t.includes(s), s);
  });

  it("`verify-write.mjs` prüft die gesperrte Spalte an `tier`", () => {
    const t = quelle("scripts/verify-write.mjs");
    assert.match(t, /update\(\{ tier: "talent" \}\)/);
  });
});
