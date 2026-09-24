import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { toRpcFailure } from "@/lib/rpc-error";

const sql = () => migrationText("v6_standbuehne_regeln");

/** Rumpf einer Funktion aus dem Migrationstext, bis zum nächsten `$$;`. */
function rumpf(name: string): string {
  const s = sql();
  const start = s.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `${name} fehlt`);
  return s.slice(start, s.indexOf("$$;", start));
}

describe("Standbühne: Zeitfenster und Partner-Status (PART-079, PART-080)", () => {
  it("das Fenster steht einmal in der Datenbank: 90 Minuten nach Öffnung, Ende 19:00", () => {
    const f = rumpf("partner_booth_window");
    assert.match(f, /open_from \+ interval '90 minutes'/);
    assert.match(f, /least\(coalesce\(sd\.open_to, time '19:00'\), time '19:00'\)/);
    assert.match(f, /st\.type = 'partner_booth'/);
  });

  it("create_slot und move_slot prüfen das Fenster für den Partner", () => {
    for (const name of ["create_slot", "move_slot"]) {
      const f = rumpf(name);
      assert.match(f, /if partner_window_binds\(p_stage_id\) then/, name);
      assert.match(f, /raise exception 'outside_partner_window' using errcode = 'P0001'/, name);
    }
  });

  it("die Helfer sind intern, die RPCs laufen als SECURITY DEFINER mit festem search_path", () => {
    const s = sql();
    assert.match(s, /revoke execute on function partner_booth_window\(uuid, uuid\) from public, anon, authenticated;/);
    assert.match(s, /revoke execute on function partner_window_binds\(uuid\) from public, anon, authenticated;/);
    for (const name of ["partner_request_publish", "partner_withdraw_publish"]) {
      const f = rumpf(name);
      assert.match(f, /security definer/, name);
      assert.match(f, /set search_path = public, extensions/, name);
      assert.match(f, /can_edit_slot\(/, name);
      assert.match(f, /log_audit\(/, name);
    }
    assert.match(s.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("Veröffentlichen anfragen setzt review und die Partner-Organisation, nie published", () => {
    const f = rumpf("partner_request_publish");
    assert.match(f, /publish_status = 'review'/);
    assert.match(f, /partner_org_id = coalesce\(/);
    assert.doesNotMatch(f, /publish_status = 'published'/);
  });

  it("der Fehler kommt als eigener Schlüssel mit dem Fenster im detail an", () => {
    const res = toRpcFailure({
      code: "P0001",
      message: "outside_partner_window",
      details: "10:30–19:00",
      hint: "",
      name: "PostgrestError",
    } as Parameters<typeof toRpcFailure>[0]);
    assert.equal(res.key, "outside_partner_window");
    assert.equal(res.detail, "10:30–19:00");
  });
});
