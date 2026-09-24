import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Tickets im Teilnehmer-Portal (TAL-015)", () => {
  it("liest nur eigene Tickets über my_tickets(), nicht die Tabelle", () => {
    const page = src("app/(talent)/tickets/page.tsx");
    assert.match(page, /rpc\("my_tickets"\)/);
    assert.doesNotMatch(page, /from\("ticket"\)/);
    const sql = migrationText("v6_my_tickets");
    assert.match(sql, /where t\.person_id = v_me/);
    assert.doesNotMatch(sql.slice(sql.indexOf("returns table"), sql.indexOf("language plpgsql")), /price|mail|note|secret/i);
  });

  it("die Wallet-Route prüft den Talent-Bereich und nutzt die personengebundene RPC", () => {
    const route = src("app/api/talent/ticket-wallet/route.ts");
    assert.match(route, /requireArea\("talent"/);
    assert.match(route, /my_ticket_wallet_link/);
    assert.match(route, /"referrer-policy": "no-referrer"/);
  });

  it("steht in der Seitengruppe Summit", () => {
    assert.match(src("app/(talent)/layout.tsx"), /href: "\/tickets"/);
  });
});
