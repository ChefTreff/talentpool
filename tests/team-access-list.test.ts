import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const sql = migrationText("v6_team_access_list");

describe("Team & Zugänge: Lesefunktion team_access_list (ADM-094)", () => {
  it("prüft den Abschnitt access, ist SECURITY DEFINER mit festem search_path und gehärtet", () => {
    assert.match(sql, /create or replace function team_access_list\(/);
    assert.match(sql, /has_admin_section\('access'\)/);
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /SET search_path TO 'public', 'extensions'/);
    assert.match(sql, /select harden_definer_functions\(\);\s*$/);
  });

  it("kennt genau vier Filter und weist alles andere mit invalid_filter ab", () => {
    assert.match(sql, /v_filter not in \('alle', 'team', 'gesperrt', 'ohne_login'\)/);
    assert.match(sql, /'invalid_filter' using errcode = '22023'/);
  });

  it("gibt weder Notizen noch Telefon oder Geburtsdatum aus und sucht mit maskierten Platzhaltern", () => {
    const rumpf = sql.split("create or replace function")[1];
    assert.doesNotMatch(rumpf, /ra\.note/);
    assert.doesNotMatch(rumpf, /phone|birth/i);
    assert.match(rumpf, /board_like_pattern\(v_q\)/);
  });

  it("schreibt nichts: keine Schreibbefehle außerhalb von Kommentaren", () => {
    const ohneKommentar = sql.replace(/--[^\n]*/g, "");
    assert.doesNotMatch(ohneKommentar, /\b(insert into|update\s+\w+\s+set|delete from)\b/i);
  });
});
