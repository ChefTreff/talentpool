import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { aenderungen, aktionsName, kurzfassung, leseVon, rpcVon } from "@/lib/audit/anzeige";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const de = JSON.parse(lies("lib/i18n/de.json")) as { auditAction: Record<string, string>; auditDomain: Record<string, string>; auditLog: Record<string, string> };
const en = JSON.parse(lies("lib/i18n/en.json")) as typeof de;

describe("Protokoll: Anzeigenamen (ADM-095 b)", () => {
  it("bekannte Aktionen haben einen Anzeigenamen, keinen Systemnamen", () => {
    assert.equal(aktionsName("kb.published", de.auditAction, de.auditDomain), "Wiki-Artikel veröffentlicht");
    assert.equal(aktionsName("kb.published", en.auditAction, en.auditDomain), "Wiki article published");
  });
  it("eine unbekannte Aktion bekommt einen lesbaren Rückfall aus Bereich und Verb", () => {
    assert.equal(aktionsName("kb.etwas_neues", de.auditAction, de.auditDomain), "Wiki: etwas neues");
    assert.equal(aktionsName("zzbereich.tut_etwas", de.auditAction, de.auditDomain), "zzbereich: tut etwas");
    assert.equal(aktionsName("bootstrap_admin", {}, {}), "bootstrap admin");
  });
  it("alle Aktionen, die im Livebestand stehen (08.10.), haben einen eigenen Namen in DE und EN", () => {
    const live = ["access.invited", "access.team_member", "application.decide", "deadline.upsert", "edition_contact.upsert", "edition_info.upsert",
      "expense.submit", "hospitality.book", "kb.published", "org_step.set", "partner.contact_upsert", "partner.onboarding", "role.assign", "role.revoke",
      "session.update", "shop.confirm", "slot.move", "speaker.pipeline", "ticket.allocation_vivenu", "tour.upsert", "volunteer.apply", "bootstrap_admin"];
    for (const a of live) {
      assert.ok(de.auditAction[a], `de ${a}`);
      assert.ok(en.auditAction[a], `en ${a}`);
    }
  });
  it("DE und EN führen dieselben Aktionen und Bereiche", () => {
    assert.deepEqual(Object.keys(de.auditAction).sort(), Object.keys(en.auditAction).sort());
    assert.deepEqual(Object.keys(de.auditDomain).sort(), Object.keys(en.auditDomain).sort());
  });
  it("kein Anzeigename ist der Systemname selbst", () => {
    for (const [k, v] of Object.entries(de.auditAction)) assert.notEqual(v, k, k);
  });
});

describe("Protokoll: Änderungen als Feldliste (ADM-095 d)", () => {
  it("nur Felder, die sich unterscheiden", () => {
    const r = aenderungen({ status: "draft", title: "A" }, { status: "published", title: "A" });
    assert.deepEqual(r, [{ feld: "status", vorher: "draft", nachher: "published" }]);
  });
  it("ohne Vorher alle Felder des Nachher; Felder nur auf einer Seite zählen", () => {
    assert.equal(aenderungen(null, { a: 1, b: "x" }).length, 2);
    assert.deepEqual(aenderungen({ a: 1 }, { b: 2 }).map((x) => x.feld), ["a", "b"]);
  });
  it("lange und verschachtelte Werte werden gekürzt, nicht ausgeschrieben", () => {
    const r = aenderungen({ x: "a".repeat(1000) }, { x: { n: 1 } });
    assert.ok(r[0].vorher.length < 300);
    assert.equal(r[0].nachher, '{"n":1}');
  });
  it("kein Vorher und kein Nachher ergibt nichts; ein Skalar wird ein Wert", () => {
    assert.deepEqual(aenderungen(null, null), []);
    assert.deepEqual(aenderungen(null, "x"), [{ feld: "Wert", vorher: "leer", nachher: "x" }]);
  });
  it("die Kurzfassung nennt die ersten drei Felder und zählt den Rest", () => {
    const rows = ["a", "b", "c", "d", "e"].map((feld) => ({ feld, vorher: "", nachher: "" }));
    assert.deepEqual(kurzfassung(rows), { felder: ["a", "b", "c"], weitere: 2 });
    assert.deepEqual(kurzfassung([]), { felder: [], weitere: 0 });
  });
});

describe("Protokoll: Umschalter (ADM-095 c)", () => {
  it("Standard ist „Personen“, unbekannte Werte fallen darauf zurück", () => {
    assert.equal(leseVon(undefined), "person");
    assert.equal(leseVon("quatsch"), "person");
    assert.equal(leseVon("system"), "system");
    assert.equal(leseVon("alle"), "alle");
  });
  it("„alle“ heisst kein Filter an der Datenbank", () => {
    assert.equal(rpcVon("alle"), null);
    assert.equal(rpcVon("person"), "person");
    assert.equal(rpcVon("system"), "system");
  });
  it("die Migration prüft den Wert und lässt sonst alles durch, ohne neue Rechte", () => {
    const sql = migrationText("v6_protokoll_umschalter");
    assert.match(sql, /p_by text DEFAULT NULL::text/);
    assert.match(sql, /raise exception 'invalid_filter' using errcode = '22023'/);
    assert.match(sql, /has_admin_section\('auditLog'\)/);
    assert.match(sql, /drop function if exists audit_log_admin\(text, text, text, uuid, timestamptz, timestamptz, integer, integer\);/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("Protokoll: Seite und Filter (ADM-095 a)", () => {
  const filter = lies("app/(admin)/admin/verwaltung/protokoll/ProtokollFilter.tsx");
  const seite = lies("app/(admin)/admin/verwaltung/protokoll/page.tsx");
  it("der Filter gilt sofort: kein Absenden-Knopf, jede Auswahl ändert die Adresse", () => {
    assert.doesNotMatch(filter, /type="submit"/);
    assert.doesNotMatch(filter, /<form/);
    assert.match(filter, /router\.replace\(/);
    for (const feld of ["aktion", "objekt", "person", "ab", "bis"]) assert.match(filter, new RegExp(`setze\\(\\{ ${feld}: e\\.target\\.value \\}\\)`), feld);
  });
  it("die Seite reicht den Umschalter und die Anzeigenamen durch, ohne Export", () => {
    assert.match(seite, /p_by: rpcVon\(von\)/);
    assert.match(seite, /aktionsName\(z\.action, aktionen, bereiche\)/);
    assert.doesNotMatch(seite, /ButtonDownload|\.csv|text\/csv/);
  });
  it("Vorher/Nachher stehen nicht mehr als zwei JSON-Felder in der Liste", () => {
    const liste = lies("app/(admin)/admin/verwaltung/protokoll/ProtokollListe.tsx");
    assert.doesNotMatch(liste, /JSON\.stringify/);
    assert.match(liste, /<Modal label=\{t\.detailTitle\}/);
  });
});
