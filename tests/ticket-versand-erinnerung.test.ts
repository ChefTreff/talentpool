import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Ticketmail und Erinnerung (TAL-019 Teil 3)", () => {
  const sql = migrationText("v6_ticket_versand_erinnerung");

  it("beide Funktionen sind nur für den Server: Prüfung auf auth.uid() und kein EXECUTE für Anmeldete", () => {
    assert.equal((sql.match(/if auth\.uid\(\) is not null then raise exception 'not allowed' using errcode = '42501'/g) ?? []).length, 2);
    assert.match(sql, /revoke execute on function remind_ticket_personalization\(\) from public, anon, authenticated/);
    assert.match(sql, /revoke execute on function tickets_mail_pending\(integer\) from public, anon, authenticated/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("die Erinnerung zählt nur offene gültige vivenu-Tickets über sieben Tage, einmal je Ticket, und schreibt keine Adresse in die Vars", () => {
    assert.match(sql, /personalization_status in \('pending', 'partial'\)/);
    assert.match(sql, /personalization_reminded_at is null/);
    assert.match(sql, /interval '7 days'/);
    const vars = sql.slice(sql.indexOf("jsonb_build_object('edition'"), sql.indexOf("'ticket', v_row.ids[1]"));
    assert.doesNotMatch(vars, /email|buyer|holder/i);
    assert.match(sql, /update ticket set personalization_reminded_at = now\(\) where id = any\(v_row\.ids\)/);
  });

  it("der Pfad in der Mail ist eine Transaktionskennung aus erlaubten Zeichen, sonst /tickets", () => {
    assert.match(sql, /\^\[A-Za-z0-9_-\]\{1,120\}\$/);
  });

  it("der Versand geht nur hinter VIVENU_WRITE_ENABLED, höchstens einmal je Ticket und behandelt eine leere 2xx-Antwort als Erfolg", () => {
    const t = src("lib/vivenu/transaktion.ts");
    const f = t.slice(t.indexOf("export async function versendeTicketMail"));
    assert.match(f, /rueckschreibenAn\(process\.env\.VIVENU_WRITE_ENABLED\)/);
    assert.match(f, /t\.vivenu_mailed_at/);
    assert.match(f, /\.is\("vivenu_mailed_at", null\)/);
    assert.match(f, /instanceof SyntaxError/);
    assert.doesNotMatch(f, /secret/i, "der Aufruf braucht kein Secret");
    // nach erfolgreichem Rückschreiben
    assert.match(t, /await markiere\(false\);\s+await versendeTicketMail\(admin, ticketId\);/);
  });

  it("die Route ist durch CRON_SECRET geschützt, im Zeitplan, und ruft beide Schritte", () => {
    const route = src("app/api/cron/ticket-erinnerung/route.ts");
    assert.match(route, /CRON_SECRET/);
    assert.match(route, /timingSafeEqual/);
    assert.match(route, /tickets_mail_pending/);
    assert.match(route, /remind_ticket_personalization/);
    assert.match(src("vercel.json"), /"path": "\/api\/cron\/ticket-erinnerung"/);
  });

  it("die Vorlage gibt es in DE und EN mit denselben Platzhaltern wie im Verzeichnis", () => {
    for (const loc of ["'de'", "'en'"]) assert.match(sql, new RegExp(`\\('ticket_personalization_reminder', ${loc},`));
    const platzhalter = [...new Set([...sql.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].sort();
    assert.deepEqual(platzhalter, ["edition", "first_name", "link_path", "n", "portal_url"]);
    assert.match(sql, /array\['first_name', 'edition', 'n', 'link_path', 'portal_url'\]/);
  });
});
