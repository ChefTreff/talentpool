import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

/**
 * SPK-095 (Plan 09.10.2026, Folge von SPK-094): die Bestandseinträge des Audits der Assistenz-Änderung (`speaker.assistant_update`) tragen nur noch die Namen
 * der Felder und die `person_id` — nie einen Wert. Eine Datenmigration; die Datenbank-Seite belegt `supabase/tests/v6_speaker_audit_bestand.sql` (8 Erwartungen auf
 * eigenen Fixtures: Zählprobe, Inhalt, Unberührtes, idempotent, kein neuer Audit-Eintrag, kein Klartext, Rechte). Hier steht, was sich ohne Datenbank festhalten lässt.
 * Der Test prüft die Migration **selbst** (Muster, Härtung) und vergleicht nichts mit dem lebenden Snapshot (db-konventionen, Nachtrag 09.10.2026).
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const sql = () => migrationText("v6_speaker_audit_bestand");
const code = (text: string) => text.replace(/--[^\n]*/g, "");

/** Der Text einer Funktion der Migration: von `create or replace function <name>(` bis zum schließenden `$f$;`. */
function funktion(text: string, name: string): string {
  const von = text.indexOf(`create or replace function ${name}(`);
  assert.ok(von >= 0, `${name} fehlt`);
  const anfang = text.indexOf("$f$", von);
  const ende = text.indexOf("$f$", anfang + 3);
  assert.ok(anfang > 0 && ende > anfang, `${name}: kein Ende gefunden`);
  return text.slice(von, ende + 3);
}

describe("SPK-095: die Migration `v6_speaker_audit_bestand`", () => {
  it("zwei interne Hilfsfunktionen, eine Datenänderung — keine Tabelle, keine Spalte, kein Trigger; am Ende die Härtung", () => {
    const c = code(sql());
    const namen = [...c.matchAll(/create or replace function (\w+)\(/g)].map((m) => m[1]);
    assert.deepEqual(namen, ["speaker_audit_felder", "speaker_audit_bereinigen"]);
    assert.doesNotMatch(c, /\b(create|alter|drop) table\b|\badd column\b|\bcreate (trigger|index|policy)\b/i);
    assert.match(c.trimEnd(), /select harden_definer_functions\(\);$/);
    // beide intern: kein EXECUTE für Aufrufer
    assert.match(c, /revoke execute on function speaker_audit_felder\(jsonb, uuid\) from public, anon, authenticated;/);
    assert.match(c, /revoke execute on function speaker_audit_bereinigen\(\) from public, anon, authenticated;/);
  });

  it("die Namensfunktion ist rein: unveränderlich, ohne Tabellenzugriff, sortierte Schlüssel, die Person nur, wenn sie bekannt ist — und nie ein Wert", () => {
    const f = code(funktion(sql(), "speaker_audit_felder"));
    assert.match(f, /language sql immutable parallel safe/);
    assert.match(f, /jsonb_agg\(k order by k\) from jsonb_object_keys\(p_after\) as k/);
    assert.match(f, /case when p_person is null then '\{\}'::jsonb else jsonb_build_object\('person_id', p_person\) end/);
    assert.doesNotMatch(f, /\b(from|join)\s+(audit_log|speaker_profile|person)\b/i, "kein Tabellenzugriff");
    // die Antwort enthält nur `felder` (und `person_id`) — der Eingabeblock selbst kommt nirgends hinein
    const rumpf = f.slice(f.indexOf("as $f$"));
    assert.equal((rumpf.match(/p_after/g) ?? []).length, 1, "`p_after` wird nur für die Schlüssel gelesen");
  });

  it("die Bereinigung trifft nur `speaker.assistant_update`, nur Objekte, nur Einträge mit mehr als `felder` und `person_id` — und setzt `before` leer", () => {
    const f = code(funktion(sql(), "speaker_audit_bereinigen"));
    assert.match(f, /language plpgsql security definer\s+set search_path = public, extensions/);
    assert.match(f, /where a\.action = 'speaker\.assistant_update'\s+and jsonb_typeof\(a\.after\) = 'object'\s+and a\.after - 'felder' - 'person_id' <> '\{\}'::jsonb/);
    assert.match(f, /set after = speaker_audit_felder\(a\.after, z\.person_id\), before = null/);
    assert.match(f, /left join speaker_profile sp on sp\.id::text = a\.object_id/);
    assert.match(f, /select a\.id, sp\.person_id\s+from audit_log a/);
    assert.match(f, /select count\(\*\)::integer into v_n from neu;\s+return v_n;/);
    // genau eine schreibende Anweisung, und nur an `audit_log`
    assert.equal((f.match(/\bupdate\s+\w+/gi) ?? []).length, 1);
    assert.match(f, /update audit_log a/);
    assert.doesNotMatch(f, /\b(insert|delete|truncate)\b/i);
  });

  it("kein neuer Audit-Eintrag: weder `log_audit` noch ein Einfügen in `audit_log`; die Migration schreibt sonst nirgends", () => {
    const c = code(sql());
    assert.doesNotMatch(c, /log_audit\(/);
    assert.doesNotMatch(c, /insert\s+into\s+audit_log/i);
    // außer in der Hilfsfunktion steht kein `update`/`delete` in der Migration
    const ohneFunktion = c.replace(funktion(c, "speaker_audit_bereinigen"), "");
    assert.doesNotMatch(ohneFunktion, /\b(update|delete)\b\s+\w/i);
  });

  it("die Migration ruft die Bereinigung einmal auf und prüft danach (Gegenprobe): bleibt ein Wert stehen, bricht sie mit P0001 ab", () => {
    const c = code(sql());
    const block = c.slice(c.indexOf("do $mig$"), c.indexOf("end $mig$"));
    assert.match(block, /v_n := speaker_audit_bereinigen\(\);/);
    assert.equal((c.match(/speaker_audit_bereinigen\(\);/g) ?? []).length, 1, "genau ein Aufruf (die Funktion selbst und der revoke tragen kein „;“ direkt dahinter)");
    assert.match(block, /where a\.action = 'speaker\.assistant_update'\s+and jsonb_typeof\(a\.after\) = 'object'\s+and a\.after - 'felder' - 'person_id' <> '\{\}'::jsonb;/);
    assert.match(block, /if v_rest <> 0 then\s+raise exception 'Bereinigung unvollstaendig: % Eintraege der Aktion speaker\.assistant_update tragen noch Werte', v_rest using errcode = 'P0001';/);
  });
});

describe("SPK-095: der DB-Test hält die Regeln fest", () => {
  const test = () => quelle("supabase/tests/v6_speaker_audit_bestand.sql");

  it("8 Erwartungen im Muster `t_erw`; Fixtures für alle Fälle (alter Block, ohne Profil, mit Vorher, gefälschter Schlüssel `felder`, neues Format, andere und ähnliche Aktion, NULL, Text, leeres Objekt, Liste)", () => {
    const t = test();
    const erw = t.slice(t.indexOf("insert into t_erw values"), t.indexOf("create function pg_temp.neu"));
    assert.deepEqual(
      [...erw.matchAll(/^\s+\('(\d\d_[a-z_]+)', /gm)].map((m) => m[1]),
      ["00_form", "01_zaehlprobe", "02_inhalt", "03_unberuehrt", "04_idempotent", "05_kein_audit", "06_kein_klartext", "07_rechte"],
    );
    for (const fixture of ["f1 ", "f2 ", "f3 ", "f9 ", "f4 ", "f5 ", "f5b", "f6 ", "f7 ", "f8 ", "f10"]) {
      assert.ok(new RegExp(`\\n  ${fixture.trim()}\\s+:= pg_temp\\.zeile\\(`).test(t), `Fixture ${fixture.trim()} fehlt`);
    }
    assert.match(t, /set local role authenticated/);
    assert.match(t, /set local role anon/);
  });

  it("die Sortierung ist sichtbar: der Eintrag mit vier Feldern kommt in jsonb-Reihenfolge (nach Länge) an und muss alphabetisch herauskommen; Zählprobe mit Rückbezug auf die Gesamtzahl", () => {
    const t = test();
    assert.match(t, /jsonb_build_array\('bio_short_en', 'first_name', 'job_title', 'phone'\)/);
    assert.match(t, /vorher_mit_werten=4 bereinigt=4 nachher_gesamt=\\1 nachher_mit_werten=0/);
    assert.match(t, /\('04_idempotent', '\^ok zweiter_lauf=0 pruefsumme_gleich=true\$'\)/);
    assert.match(t, /\('05_kein_audit', '\^ok zeilen_gleich=true max_id_gleich=true\$'\)/);
  });
});

describe("SPK-095: Doku", () => {
  it("README der DB-Tests: eine Zeile für `v6_speaker_audit_bestand.sql`", () => {
    const zeile = quelle("supabase/tests/README.md").split("\n").find((l) => l.startsWith("| `v6_speaker_audit_bestand.sql` |"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /SPK-095/);
    assert.match(zeile, /idempotent/);
    assert.match(zeile, /8 Erwartungen/);
  });

  it("Testleitfaden: die Zeile zum Protokoll sagt, dass auch ältere Einträge nur Feldnamen zeigen", () => {
    const zeile = quelle("docs/team-testleitfaden.md").split("\n").find((l) => l.includes("Assistenz-Änderung im Profil (SPK-094)"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /auch ältere Einträge zeigen seit SPK-095 nur die Namen der Felder/);
    assert.doesNotMatch(zeile, /ältere Einträge zeigen noch Werte/);
  });

  it("Backlog: SPK-095 trägt die PR-Nummer und nennt die Migration", () => {
    const zeile = quelle("docs/feedback/speaker.md").split("\n").find((l) => l.startsWith("| SPK-095 |"));
    assert.ok(zeile && /\| P2 \| (geplant|gebaut|abgenommen) #\d+/.test(zeile), "SPK-095 trägt keine PR-Nummer");
    assert.match(zeile, /Migration enthalten/);
  });
});
