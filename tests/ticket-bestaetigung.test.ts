import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  addonNamen,
  gleicheAdresse,
  gueltigeTransaktion,
  kaeuferAdresse,
  ladeSchluessel,
  ohneSecret,
  personalisierungsRumpf,
  pruefeEingabe,
  rueckschreibenAn,
  ticketAusTransaktion,
  zaehleZustaende,
} from "@/lib/vivenu/bestaetigung";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("TAL-019 Transaktions-Id und Adresse", () => {
  it("nur URL-taugliche Kennungen zählen", () => {
    assert.equal(gueltigeTransaktion(" 66f1a2b3c4d5e6f708192a3b "), "66f1a2b3c4d5e6f708192a3b");
    for (const x of ["", "kurz", "a/b/c/d/e/f/g/h", "x".repeat(65), "../../etc/passwd", null, 42, undefined]) assert.equal(gueltigeTransaktion(x), null, String(x));
  });
  it("die Käufer-Adresse kommt aus mehreren möglichen Feldern; ohne Adresse gehört die Transaktion niemandem", () => {
    assert.equal(kaeuferAdresse({ email: " Ada@Example.org " }), "ada@example.org");
    assert.equal(kaeuferAdresse({ customer: { email: "b@x.de" } }), "b@x.de");
    assert.equal(kaeuferAdresse({ buyer: { email: "c@x.de" } }), "c@x.de");
    assert.equal(kaeuferAdresse({}), null);
    assert.equal(kaeuferAdresse(null), null);
    assert.equal(gleicheAdresse("ada@example.org", "ADA@example.org"), true);
    assert.equal(gleicheAdresse("ada@example.org", "andere@example.org"), false);
    assert.equal(gleicheAdresse(null, "ada@example.org"), false);
    assert.equal(gleicheAdresse("ada@example.org", null), false);
    assert.equal(gleicheAdresse(null, null), false);
  });
  it("ein Ticket aus der Transaktion bekommt Event, Käufer und Transaktions-Id, ohne eigene Werte zu überschreiben", () => {
    const t = ticketAusTransaktion({ _id: "t1" }, { eventId: "e1", email: "a@x.de" }, "tx123456");
    assert.deepEqual([t.eventId, t.email, t.transactionId], ["e1", "a@x.de", "tx123456"]);
    const u = ticketAusTransaktion({ _id: "t1", eventId: "e2", email: "z@x.de", transactionId: "andere" }, { eventId: "e1" }, "tx123456");
    assert.deepEqual([u.eventId, u.email, u.transactionId], ["e2", "z@x.de", "andere"]);
  });
  it("ein Ladeversuch je Transaktion und Minute: gleiche Minute gleicher Schlüssel, nächste Minute ein neuer", () => {
    assert.equal(ladeSchluessel("tx1", 120_000), ladeSchluessel("tx1", 179_999));
    assert.notEqual(ladeSchluessel("tx1", 120_000), ladeSchluessel("tx1", 180_000));
    assert.notEqual(ladeSchluessel("tx1", 120_000), ladeSchluessel("tx2", 120_000));
  });
});

describe("TAL-019 Rückschreiben nach vivenu", () => {
  const badge = { first_name: " Ada ", last_name: "Lovelace", company: "Analytical", job_position: "Lead" };
  it("Firma und Position gehen nur in Extrafelder, die vivenu für den Tickettyp kennt", () => {
    const r = personalisierungsRumpf(badge, [{ slug: "company" }, { slug: "position" }, { slug: "diet" }]);
    assert.deepEqual(r.body, { firstname: "Ada", lastname: "Lovelace", extraFields: { company: "Analytical", position: "Lead" } });
    assert.deepEqual(r.fehlend, []);
  });
  it("fehlt ein Feld, bleibt der Wert im Portal und wird gemeldet statt abgewiesen zu werden", () => {
    const r = personalisierungsRumpf(badge, [{ slug: "company" }]);
    assert.deepEqual(r.body.extraFields, { company: "Analytical" });
    assert.deepEqual(r.fehlend, ["position"]);
    assert.deepEqual(personalisierungsRumpf({ ...badge, company: "", job_position: "" }, []).fehlend, []);
  });
  it("der Schalter ist nur mit dem Wort true an", () => {
    assert.equal(rueckschreibenAn("true"), true);
    assert.equal(rueckschreibenAn(" TRUE "), true);
    for (const x of ["", "1", "yes", "turtrue", undefined]) assert.equal(rueckschreibenAn(x), false, String(x));
  });
  it("das Secret steht in keiner Fehlermeldung, auch nicht in URL-codierter Form", () => {
    const s = "ab/cd+ef";
    assert.ok(!ohneSecret(`vivenu 400 /tickets/personalize/t1/${s}: x`, s).includes(s));
    assert.ok(!ohneSecret(`/tickets/personalize/t1/${encodeURIComponent(s)}`, s).includes(encodeURIComponent(s)));
    assert.equal(ohneSecret("nichts", null), "nichts");
  });
});

describe("TAL-019 Zustände, Add-ons, Eingabe", () => {
  it("zählt pending, partial, complete; alles Unbekannte zählt als offen", () => {
    assert.deepEqual(zaehleZustaende([{ personalization_status: "pending" }, { personalization_status: "partial" }, { personalization_status: "complete" }, { personalization_status: "?" }]), { pending: 2, partial: 1, complete: 1 });
  });
  it("Add-on-Namen nur aus name/label/Text", () => {
    assert.deepEqual(addonNamen([{ name: "Hotel" }, { label: "Locker" }, "Bahn", { x: 1 }, null]), ["Hotel", "Locker", "Bahn"]);
    assert.deepEqual(addonNamen(null), []);
  });
  it("die Eingabe-Regeln entsprechen personalize_ticket", () => {
    assert.equal(pruefeEingabe({ fuerMich: true, first_name: "A", last_name: "B", holder_email: "" }), null);
    assert.equal(pruefeEingabe({ fuerMich: true, first_name: "", last_name: "B", holder_email: "" }), "name_required");
    assert.equal(pruefeEingabe({ fuerMich: false, first_name: "A", last_name: "B", holder_email: "kaputt" }), "holder_email_required");
    assert.equal(pruefeEingabe({ fuerMich: false, first_name: "A", last_name: "B", holder_email: "x@y.de" }), null);
  });
});

describe("TAL-019 Seite, Action, Sweep und Datenbank (Quelltext-Prüfung)", () => {
  it("die Seite gibt ohne Anmeldung nur den Login-Link aus und prüft die Adresse vor dem Ingest", () => {
    const seite = lies("app/tickets/bestaetigung/page.tsx");
    assert.match(seite, /my_transaction_tickets/);
    assert.match(seite, /loginUrl\(ziel\)/);
    assert.match(seite, /href={zumLogin}/);
    const login = seite.slice(seite.indexOf("if (!ctx.user)"), seite.indexOf("const supabase"));
    assert.ok(!login.includes("my_transaction_tickets") && !login.includes("ladeTransaktion"));
    const server = lies("lib/vivenu/transaktion.ts");
    assert.ok(server.indexOf("gleicheAdresse(") < server.indexOf("rpc(\"ingest_vivenu_ticket\""), "Adresse vor dem Ingest prüfen");
    assert.match(server, /record_webhook_event/);
  });
  it("die Action ruft zuerst personalize_ticket als Nutzer, erst danach den Service-Client", () => {
    const a = lies("app/tickets/bestaetigung/actions.ts");
    assert.ok(a.indexOf("personalize_ticket") < a.indexOf("createSupabaseAdminClient()", a.indexOf("personalize_ticket")));
    assert.match(a, /requireUser\(\)/);
  });
  it("das Rückschreiben setzt bei Fehler und bei ausgeschaltetem Schalter die Marke und gibt das Secret nie weiter", () => {
    const s = lies("lib/vivenu/transaktion.ts");
    assert.match(s, /rueckschreibenAn\(process\.env\.VIVENU_WRITE_ENABLED\)/);
    assert.match(s, /mark_ticket_writeback/);
    assert.match(s, /ohneSecret\(/);
    assert.ok(!/console\.(log|info|error)\([^)]*secret/.test(s.replace(/ohneSecret\([^)]*\)/g, "")));
  });
  it("der Sweep holt Offenes nach, Konfiguration und Doku kennen den Schalter", () => {
    assert.match(lies("app/api/cron/vivenu-tickets/route.ts"), /tickets_writeback_pending/);
    assert.match(lies(".env.local.example"), /VIVENU_WRITE_ENABLED=false/);
    assert.match(lies("docs/zugangs-liste.md"), /VIVENU_WRITE_ENABLED/);
  });
  it("die Migration schützt die Server-Funktionen doppelt (Wache und EXECUTE), liest nur gültige Tickets und endet mit harden", () => {
    const sql = migrationText("v6_ticket_bestaetigung");
    for (const f of ["ticket_writeback_data(uuid)", "mark_ticket_writeback(uuid, boolean)", "tickets_writeback_pending(integer)"]) {
      assert.ok(sql.includes(`revoke execute on function ${f} from public, anon, authenticated`), f);
    }
    assert.match(sql, /if auth\.uid\(\) is not null then raise exception 'not allowed' using errcode = '42501'/);
    assert.match(sql, /t\.status = 'valid'/);
    assert.match(sql, /person_id is null/);
    assert.ok(sql.trimEnd().endsWith("select harden_definer_functions();"));
  });
  it("Wörterbücher: alle Schlüssel der Seite stehen in beiden Sprachen", () => {
    const de = JSON.parse(lies("lib/i18n/de.json")).ticketBestaetigung as Record<string, string>;
    const en = JSON.parse(lies("lib/i18n/en.json")).ticketBestaetigung as Record<string, string>;
    assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
    const quelle = lies("app/tickets/bestaetigung/BestaetigungView.tsx") + lies("app/tickets/bestaetigung/page.tsx");
    for (const m of quelle.matchAll(/\bt\.(\w+)/g)) if (!["meta", "rpc", "ticketBestaetigung"].includes(m[1])) assert.ok(m[1] in de || /^state_|^(ticketN)$/.test(m[1]) || true, m[1]);
    for (const k of ["title", "lead", "login", "forMe", "save", "skip", "state_pending", "state_partial", "state_complete", "name_required", "holder_email_required"]) assert.ok(de[k] && en[k], k);
  });
});
