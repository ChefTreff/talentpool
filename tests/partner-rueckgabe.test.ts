import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

/**
 * PART-083: der Rückgabegrund der Programmleitung liegt in einer eigenen Tabelle
 * ohne Grants — **nicht** als Spalte an `session`, die über ihren Tabellen-Grant
 * für die Speaker einer Session lesbar wäre. Der SQL-Test prüft das gegen die
 * Datenbank; dieser hält die Entscheidung im npm-Gate fest, damit sie ein
 * späterer Umbau nicht still zurückdreht.
 */
describe("Rückgabegrund der Programmleitung (PART-083)", () => {
  const sql = migrationText("v6_rueckgabegrund");

  it("hängt keine Spalte an session", () => {
    assert.doesNotMatch(sql, /alter\s+table\s+(public\.)?session\s+add/i);
  });

  it("legt eine eigene Tabelle mit RLS und ohne Grants an", () => {
    assert.match(sql, /create table if not exists partner_session_return/);
    assert.match(sql, /alter table partner_session_return enable row level security/);
    assert.match(sql, /revoke all on partner_session_return from public, anon, authenticated/);
    assert.doesNotMatch(sql, /grant\s+[^;]*\bon\s+(table\s+)?partner_session_return/i);
  });

  it("endet mit harden_definer_functions()", () => {
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});
