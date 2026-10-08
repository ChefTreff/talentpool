import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const sql = migrationText("v6_team_hinweismail");
const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const actions = lies("app/(admin)/admin/verwaltung/zugaenge/actions.ts");
const formular = lies("app/(admin)/admin/verwaltung/zugaenge/TeamEinladung.tsx");

/** Ohne `--`-Kommentare, damit Erklärungen im Kopf nichts vortäuschen. */
const code = sql.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

describe("Hinweismail an Teammitglieder mit Konto (ADM-086)", () => {
  it("die Mail kommt aus der Datenbank, über die Warteschlange, nur bei Login und neuen Rollen", () => {
    assert.match(code, /if v_login and cardinality\(v_vergeben\) > 0 then/);
    assert.match(code, /queue_mail\('team_member_added', v_pid,/);
    assert.match(code, /has_admin_section\('access'\)/);
    assert.match(code, /v_rolle = 'admin' or not \(v_rolle = any \(team_role_keys\(\)\)\)/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("Vorlage in DE und EN: Portal-Link ohne Magic Link, Rollen in Worten je Sprache", () => {
    for (const l of ["de", "en"]) {
      const m = code.match(new RegExp(`\\('team_member_added', '${l}', 1, '([^']+)',\\s*E'([\\s\\S]*?)',\\s*'`));
      assert.ok(m, `Vorlage ${l}`);
      assert.match(m[2], /\{\{portal_url\}\}\/login/);
      assert.match(m[2], new RegExp(`\\{\\{roles_${l}\\}\\}`));
      assert.match(m[2], /\{\{first_name\}\}/);
      assert.doesNotMatch(m[2], /token|magic|invite/i);
    }
  });

  it("Audit ohne Klartext-Adresse", () => {
    const audit = code.slice(code.indexOf("perform log_audit('access.team_member'"));
    const aufruf = audit.slice(0, audit.indexOf(");"));
    assert.doesNotMatch(aufruf, /'email'/);
    assert.doesNotMatch(aufruf, /v_email/);
    assert.match(aufruf, /'mail', v_mail/);
  });

  it("die Aktion reicht den Mailstand an die Oberfläche, die Oberfläche nennt ihn im Hinweis", () => {
    const fn = actions.slice(actions.indexOf("export async function ladeTeamEin"));
    assert.match(fn, /mail: r\.mail \?\? "none"/);
    assert.match(formular, /r\.mail === "queued" \? t\.teamMailQueued/);
    assert.match(formular, /r\.mail === "suppressed" \? t\.teamMailSuppressed/);
  });

  it("die neuen Hinweistexte stehen in DE und EN", () => {
    for (const l of ["de", "en"]) {
      const d = lies(`lib/i18n/${l}.json`);
      for (const k of ["teamMailQueued", "teamMailSuppressed", "teamRolesOnly"]) assert.match(d, new RegExp(`"${k}":`), `${l}.${k}`);
    }
  });
});
