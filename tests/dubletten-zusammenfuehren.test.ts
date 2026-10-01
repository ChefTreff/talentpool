import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { adminSection } from "@/lib/admin-sections";
import { toRpcFailure } from "@/lib/rpc-error";
import { migrationText } from "@/tests/migration-datei";
import de from "@/lib/i18n/de.json" with { type: "json" };
import en from "@/lib/i18n/en.json" with { type: "json" };

const sql = migrationText("v6_dubletten_zusammenfuehren");
const ohneKommentar = sql.replace(/--.*$/gm, "");

function funktion(name: string): string {
  const start = ohneKommentar.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `${name} fehlt`);
  const ende = ohneKommentar.indexOf("end $$;", start);
  return ohneKommentar.slice(start, ende);
}

describe("Dubletten zusammenführen (ADM-036)", () => {
  it("bleibt in der Verwaltung: Abschnitt duplicates nur für admin", () => {
    assert.deepEqual([...adminSection("duplicates").roles], []);
  });

  it("jede aufrufbare Funktion prüft Anmeldung und Abschnitt", () => {
    for (const fn of ["person_merge_preview", "merge_persons", "unmerge_persons", "person_merges_admin", "duplicate_candidates_admin", "duplicate_scan"]) {
      const body = funktion(fn);
      assert.match(body, /current_person_id\(\) is null then raise exception 'not authenticated' using errcode = '28000'/, fn);
      assert.match(body, /has_admin_section\('duplicates'\)/, fn);
    }
  });

  it("der Ablauf selbst ist intern — kein Aufruf am Abschnitt vorbei", () => {
    assert.match(sql, /revoke execute on function person_merge_core\(uuid, uuid\) from public, anon, authenticated;/);
  });

  it("liest die Verweise auf person aus dem Katalog, statt Tabellen aufzuzählen", () => {
    const core = funktion("person_merge_core");
    assert.match(core, /from pg_constraint c/);
    assert.match(core, /c\.confrelid = 'public\.person'::regclass/);
  });

  it("löscht die zweite Person nur ohne Hindernis — sonst nähme on delete cascade die Konfliktzeilen mit", () => {
    const core = funktion("person_merge_core");
    const sperre = core.indexOf("if cardinality(v_blocking) = 0 then");
    const loeschen = core.indexOf("delete from person where id = p_merged");
    assert.ok(sperre >= 0 && loeschen > sperre);
  });

  it("die Vorschau nimmt den Ablauf zurück, das Zusammenführen bricht bei Hindernis ab", () => {
    assert.match(funktion("person_merge_preview"), /raise exception 'preview_rollback' using errcode = 'P0098';\s*exception when sqlstate 'P0098' then null;/);
    assert.match(funktion("merge_persons"), /raise exception 'merge_conflict' using errcode = 'P0001'/);
  });

  it("anonymize_person leert die Protokolle, in denen die Person die bleibende war", () => {
    assert.match(funktion("anonymize_person"), /update person_merge_log set payload = null where surviving_person_id = p_person_id;/);
  });

  it("endet mit harden_definer_functions()", () => {
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("jeder Fehlerschlüssel kommt als Schlüssel an und steht in beiden Wörterbüchern", () => {
    for (const key of ["same_person", "person_deleted", "person_not_found", "merge_conflict", "merge_not_found", "merge_already_undone", "merge_undo_unavailable", "merge_undo_blocked"]) {
      assert.equal(toRpcFailure({ message: key, code: "P0001", details: "", hint: "", name: "PostgrestError" } as Parameters<typeof toRpcFailure>[0]).key, key);
      assert.ok((de.rpc as Record<string, string>)[key], `de.rpc.${key}`);
      assert.ok((en.rpc as Record<string, string>)[key], `en.rpc.${key}`);
    }
  });

  it("die Seiten rufen die Sitzung, nicht die Service-Rolle, für Zusammenführen und Rückweg", () => {
    const actions = readFileSync(new URL("../app/(admin)/admin/dubletten/actions.ts", import.meta.url), "utf8");
    for (const rpc of ["merge_persons", "unmerge_persons", "duplicate_scan"]) {
      const i = actions.indexOf(`rpc("${rpc}"`);
      assert.ok(i >= 0, rpc);
      const vorher = actions.slice(actions.lastIndexOf("export async function", i), i);
      assert.match(vorher, /createSupabaseServerClient\(\)/, rpc);
    }
  });
});
