import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { NICHT_PERSONALISIERT_SPALTEN, type NichtPersonalisiert } from "@/lib/tickets/nicht-personalisiert";
import { fehlerText } from "@/lib/vivenu/bestaetigung";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const json = (p: string) => JSON.parse(src(p));

describe("Ein Ticket je Person und Edition, Weg über „Tickets“ (TAL-020, Teil Talent)", () => {
  const sql = migrationText("v6_ticket_regel_ein_ticket");

  it("die Regel zählt nur gespeicherte, gültige Tickets derselben Edition und nie das Ticket selbst", () => {
    assert.match(sql, /if p_for_me then/);
    assert.match(sql, /o\.person_id = v_pid and o\.id <> p_ticket_id/);
    assert.match(sql, /o\.status in \('valid', 'checked_in'\) and o\.personalization_status <> 'pending'/);
    assert.match(sql, /coalesce\(oe\.edition_id, oe\.id\) = v_edition/);
    assert.match(sql, /raise exception 'person_has_ticket' using errcode = 'P0001'/);
    // „andere Person“ bleibt möglich: die Prüfung steht nur im Zweig „für mich“
    assert.doesNotMatch(sql.slice(sql.indexOf("if p_for_me then"), sql.indexOf("v_complete := coalesce")), /else/);
  });

  it("my_tickets liefert Stand und Transaktions-Id, weiter ohne Preis, Mail, Notiz, Secret, und endet gehärtet", () => {
    const klein = sql.toLowerCase();
    const form = klein.slice(klein.indexOf("returns table"), klein.indexOf("language plpgsql", klein.indexOf("returns table")));
    assert.match(form, /personalization_status text, vivenu_transaction_id text/i);
    assert.doesNotMatch(form, /price|mail|note|secret/i);
    assert.match(sql, /drop function if exists my_tickets\(\)/);
    assert.match(sql, /revoke execute on function my_tickets\(\) from public, anon/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("die Seite „Tickets“ verlinkt die Bestätigungsseite mit der Transaktions-Id, nur bei gültigem, nicht vollständigem Ticket", () => {
    const page = src("app/(talent)/tickets/page.tsx");
    assert.match(page, /k\.status === "valid" && k\.personalization_status !== "complete" && k\.vivenu_transaction_id/);
    assert.match(page, /\/tickets\/bestaetigung\?transactionId=\$\{encodeURIComponent\(k\.vivenu_transaction_id\)\}/);
    assert.equal((page.match(/\{ergaenzen\(k\)\}/g) ?? []).length, 2);
  });

  it("Admin-Liste und CSV zeigen den Pass mit der Bezeichnung des Tickettyps, nicht den Schlüssel", () => {
    assert.match(src("app/(admin)/admin/bewerbungen/tickets/page.tsx"), /vlabel\(vocab, "ticket_type", z\.pass_type\)/);
    assert.match(src("app/(admin)/admin/bewerbungen/tickets/liste/route.ts"), /c\.wert\(z, pass\)/);
    const z = { pass_type: "student" } as NichtPersonalisiert;
    const spalte = NICHT_PERSONALISIERT_SPALTEN.find((c) => c.label === "Pass")!;
    assert.equal(spalte.wert(z, (k) => (k === "student" ? "Student" : (k ?? ""))), "Student");
    assert.equal(spalte.wert(z), "student", "ohne Übersetzung bleibt der Schlüssel");
    assert.equal(spalte.wert({ pass_type: null } as NichtPersonalisiert), "");
  });

  it("person_has_ticket hat einen eigenen Text in beiden Sprachen und führt zum Weg „Andere Person“", () => {
    for (const loc of ["de", "en"]) {
      const d = json(`lib/i18n/${loc}.json`);
      assert.ok(d.ticketBestaetigung.person_has_ticket.length > 40, loc);
      assert.ok(d.talentTickets.completeNow, loc);
    }
    const de = json("lib/i18n/de.json").ticketBestaetigung;
    assert.match(fehlerText("person_has_ticket", de, { unknown: "?" }), /Andere Person/);
    assert.match(src("lib/rpc-error.ts"), /"person_has_ticket"/);
  });
});
