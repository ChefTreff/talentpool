import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  NICHT_PERSONALISIERT_SPALTEN,
  summiere,
  type NichtPersonalisiert,
} from "@/lib/tickets/nicht-personalisiert";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const zeile = (o: Partial<NichtPersonalisiert> = {}): NichtPersonalisiert => ({
  ticket_id: "t1",
  event_name: "Summit 27",
  pass_type: "Visitor",
  personalization_status: "pending",
  buyer_email: "k@example.org",
  holder_first_name: null,
  holder_last_name: null,
  holder_company: null,
  purchased_at: "2026-10-01T10:00:00Z",
  writeback_open: false,
  ...o,
});

describe("TAL-019 Teil 2: Liste nicht personalisiert", () => {
  it("die Spalten enthalten weder Barcode noch Secret, aber die Käufer-Adresse", () => {
    const labels = NICHT_PERSONALISIERT_SPALTEN.map((c) => c.label.toLowerCase());
    assert.ok(!labels.some((l) => l.includes("barcode") || l.includes("secret") || l.includes("code")));
    assert.ok(labels.includes("käufer-e-mail"));
  });
  it("Stand, Datum und Rückschreiben werden lesbar ausgegeben", () => {
    const z = zeile({ personalization_status: "partial", writeback_open: true });
    const w = Object.fromEntries(NICHT_PERSONALISIERT_SPALTEN.map((c) => [c.label, c.wert(z)]));
    assert.equal(w["Stand"], "teilweise");
    assert.equal(w["Gekauft"], "2026-10-01");
    assert.equal(w["Rückschreiben offen"], "ja");
    assert.equal(w["Vorname"], "");
  });
  it("summiere zählt über alle Editionen", () => {
    const s = summiere([
      { event_id: "a", event_name: "A", pending: 2, partial: 1, complete: 5, writeback_open: 1 },
      { event_id: "b", event_name: "B", pending: 1, partial: 0, complete: 2, writeback_open: 0 },
    ]);
    assert.deepEqual(s, { pending: 3, partial: 1, complete: 7, writebackOpen: 1 });
  });
});

describe("TAL-019 Teil 2: Migration und Seite", () => {
  const sql = migrationText("v6_ticket_personalisierung_admin");
  it("beide Funktionen sind hinter dem bestehenden Abschnitt applications gesperrt; kein neuer Abschnitt", () => {
    assert.equal((sql.match(/if not coalesce\(has_admin_section\('applications'\)/g) ?? []).length, 2);
    assert.ok(!/insert into admin_section_role/i.test(sql));
    assert.match(sql, /errcode = '42501'/);
    assert.match(sql, /select harden_definer_functions\(\);\s*$/);
  });
  it("nur Teilnehmer-Tickets (vivenu, gültig), ohne Barcode und Secret in der Antwort", () => {
    assert.match(sql, /t\.source = 'vivenu' and t\.status = 'valid'/);
    assert.ok(!/t\.barcode|ticket_secret/.test(sql));
  });
  it("die Seite liegt unter bewerbungen/tickets, nutzt applications und die CSV läuft über csvCell", () => {
    const seite = lies("app/(admin)/admin/bewerbungen/tickets/page.tsx");
    assert.match(seite, /requireAdminSection\("applications"/);
    assert.match(seite, /ticket_personalization_overview/);
    const csv = lies("app/(admin)/admin/bewerbungen/tickets/liste/route.ts");
    assert.match(csv, /csvCell/);
    assert.match(csv, /requireAdminSection\("applications"/);
  });
  it("der Reiter „Tickets“ steht auf allen drei Seiten des Bereichs", () => {
    for (const p of ["page.tsx", "sessions/page.tsx", "tickets/page.tsx"]) {
      assert.match(lies(`app/(admin)/admin/bewerbungen/${p}`), /\/tickets`, label: a\.tabTickets/);
    }
  });
});
