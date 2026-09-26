import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { migrationText } from "@/tests/migration-datei";
import { join } from "node:path";

/**
 * PORT4b: Eine Kontosperre wirkt nur, wenn **jede** Funktion sie kennt, die
 * Rollen der angemeldeten Person liest.
 *
 * Der Reflex war, sie an einer Stelle einzubauen — `active_roles()` sieht nach
 * dem Flaschenhals aus. Ist sie nicht: `has_role()` liest `role_assignment`
 * direkt, und fünf weitere Funktionen tun dasselbe. Eine Sperre, die nur in
 * einer davon greift, ist schlimmer als keine: sie sieht wie Schutz aus.
 *
 * Dieser Test findet die Funktionen selbst, statt eine gepflegte Liste zu
 * vergleichen — eine Liste altert, das Muster nicht. Wer künftig eine siebte
 * Funktion mit demselben Filter schreibt, fällt hier auf und nicht im Betrieb.
 */
function fassungen(): Map<string, string> {
  const out = new Map<string, string>();
  const snap = join("supabase", "snapshot", "functions");
  if (existsSync(snap)) {
    for (const f of readdirSync(snap).filter((x) => x.endsWith(".sql"))) {
      out.set(f.replace(/\.sql$/, "").split("--")[0], readFileSync(join(snap, f), "utf8"));
    }
  }
  // Vorschläge gewinnen: sie sind die neuere Fassung, auch wenn sie noch nicht
  // angewendet sind.
  const vor = join("supabase", "migrations", "vorschlag");
  if (existsSync(vor)) {
    for (const f of readdirSync(vor).filter((x) => x.endsWith(".sql"))) {
      const sql = readFileSync(join(vor, f), "utf8");
      for (const [, name] of sql.matchAll(/create or replace function\s+([a-z0-9_]+)\s*\(/gi)) {
        const von = sql.indexOf(`create or replace function ${name}`);
        const bis = sql.indexOf("$$;", von);
        out.set(name, sql.slice(von, bis === -1 ? undefined : bis));
      }
    }
  }
  return out;
}

describe("PORT4b: die Sperre gilt überall", () => {
  it("jede Funktion, die Rollen der eigenen Person liest, kennt die Sperre", () => {
    const alle = fassungen();
    const betroffen: string[] = [];
    for (const [name, sql] of alle) {
      const liestRollen = /role_assignment/i.test(sql) && /person_id\s*=\s*current_person_id\(\)/i.test(sql);
      if (liestRollen) betroffen.push(name);
    }
    // Ohne Fundstelle prüfte der Test nichts — dann stimmt das Muster nicht mehr.
    assert.ok(betroffen.length >= 6, `zu wenige Fundstellen: ${betroffen.join(", ")}`);
    const ohne = betroffen.filter((n) => !/access_blocked_at/i.test(alle.get(n) ?? "")).sort();
    assert.deepEqual(ohne, [], "ohne Sperrprüfung");
  });

  it("die Sperre räumt keine Rollen ab", () => {
    // Entsperren muss wiederherstellen, was vorher galt. Wer beim Sperren
    // `role_assignment` anfasst, hat gelöscht und nennt es deaktiviert.
    // Über `migrationText`, nicht über den Vorschlagspfad: die
    // Architektur-Session benennt Vorschläge beim Anwenden um, und ein fest
    // verdrahteter Pfad ist danach rot (24.09., 0161/0162 — und am 26.09. hier
    // prompt wieder passiert).
    const sql = migrationText("v6_zugaenge");
    const setter = sql.slice(sql.indexOf("function set_person_access"));
    assert.equal(/update\s+role_assignment/i.test(setter), false, "set_person_access fasst Rollen an");
    assert.equal(/delete\s+from\s+role_assignment/i.test(setter), false, "set_person_access löscht Rollen");
  });
});
