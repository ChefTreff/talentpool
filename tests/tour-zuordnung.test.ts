import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { adminSection } from "@/lib/admin-sections";
import { toRpcFailure } from "@/lib/rpc-error";
import { migrationText } from "@/tests/migration-datei";

const sql = migrationText("v6_tour_zuordnung");
const ohneKommentar = sql.replace(/--.*$/gm, "");
const funktion = (name: string) => {
  const start = ohneKommentar.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, name);
  return ohneKommentar.slice(start, ohneKommentar.indexOf("end $$;", start));
};

describe("Tour-Zuordnung (ADM-045)", () => {
  it("eigener Abschnitt, in TS und Datenbank dieselben Rollen", () => {
    const rollen = [...adminSection("tourAssignment").roles].sort();
    assert.deepEqual(rollen, ["area_lead_partner", "area_lead_production", "partner_team", "production_team", "programme_team"]);
    for (const r of ["admin", ...rollen]) assert.match(sql, new RegExp(`\\('tourAssignment', '${r}'\\)`), r);
  });

  it("jede Funktion prüft Anmeldung und Abschnitt; Zuordnen, Tauschen und Typ schreiben ins Audit", () => {
    for (const fn of ["tour_assignment_admin", "ensure_company_tours", "set_company_tour_type", "assign_tour_stop", "swap_tour_stops"]) {
      assert.match(funktion(fn), /errcode = '28000'/, fn);
      assert.match(funktion(fn), /has_admin_section\('tourAssignment'\)/, fn);
    }
    assert.match(funktion("assign_tour_stop"), /log_audit\('tour\.assign'/);
    assert.match(funktion("swap_tour_stops"), /log_audit\('tour\.swap'/);
    assert.match(funktion("set_company_tour_type"), /log_audit\('tour\.type'/);
  });

  it("Tauschen bewegt die Position, nicht die Partner-Angaben", () => {
    const swap = funktion("swap_tour_stops");
    assert.match(swap, /set tour_id = a\.tour_id, sort_order = a\.sort_order,\s+arrival_at = a\.arrival_at, departure_at = a\.departure_at/);
    assert.doesNotMatch(swap, /host_org_id\s*=/);
  });

  it("Fehlerschlüssel partner_already_on_tour kommt als Schlüssel an", () => {
    assert.equal(toRpcFailure({ message: "partner_already_on_tour", code: "P0001", details: "", hint: "", name: "PostgrestError" } as Parameters<typeof toRpcFailure>[0]).key, "partner_already_on_tour");
  });

  it("die Seite schreibt nur über die Actions mit Gate tourAssignment", () => {
    const actions = readFileSync(new URL("../app/(admin)/admin/company-tours/zuordnung/actions.ts", import.meta.url), "utf8");
    assert.match(actions, /requireAdminSection\("tourAssignment", PFAD\)/);
    assert.match(actions, /createSupabaseServerClient\(\)/);
    assert.doesNotMatch(actions, /createSupabaseAdminClient/);
  });

  it("endet mit harden_definer_functions()", () => {
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});
