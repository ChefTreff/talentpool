import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

/**
 * ADM-086 auf allen drei Wegen (Plan 10.10.2026): „Neu einladen“ schickte schon die Hinweismail an Personen mit Konto; „+ Rolle“ in der Liste und „Aus dem Talentpool“
 * riefen `assign_role` direkt auf und schickten nichts. Jetzt gehen beide über `grant_team_role` (Abschnitt `access`, gleiche Regel, gleiche Vorlage). Die
 * Datenbankseite belegt `supabase/tests/v6_grant_team_role.sql` (10 Erwartungen mit Rollenwechsel); hier steht, was sich ohne Datenbank festhalten lässt.
 */
const sql = () => migrationText("v6_grant_team_role");
const code = (t: string) => t.replace(/--[^\n]*/g, "");
const quelle = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const DIR = "app/(admin)/admin/verwaltung/zugaenge";

describe("grant_team_role: die Funktion", () => {
  it("prüft zuerst Anmeldung und Abschnitt access, dann Rolle, Person, Sperre und Edition — und ändert nichts vor diesen Prüfungen", () => {
    const c = code(sql());
    const reihenfolge = ["has_admin_section('access')", "team_role_keys()", "'person_not_found'", "'access_blocked'", "'edition_not_found'", "perform assign_role("];
    let von = -1;
    for (const m of reihenfolge) {
      const i = c.indexOf(m);
      assert.ok(i > von, `${m} fehlt oder steht an falscher Stelle`);
      von = i;
    }
  });

  it("ist SECURITY DEFINER mit gepinntem search_path, ohne dynamisches SQL, und endet mit `harden_definer_functions()`", () => {
    const c = code(sql());
    assert.match(c, /SECURITY DEFINER/);
    assert.match(c, /SET search_path TO 'public', 'extensions'/);
    assert.doesNotMatch(c, /\bexecute\b|format\(/i);
    assert.match(c.trim(), /select harden_definer_functions\(\);$/);
  });

  it("`admin` ist immer global, jede andere Rolle gilt für die Edition, wenn eine gegeben ist", () => {
    const c = code(sql());
    assert.match(c, /v_ed uuid := case when p_role = 'admin' then null else p_edition_id end;/);
    assert.match(c, /v_scope := case when v_ed is null then 'global' else 'edition' end;/);
  });

  it("die Mail geht nur bei Konto **und** neuer Rolle, über `queue_mail` und dieselbe Vorlage wie `create_team_member`; die Adresse kommt aus der Datenbank", () => {
    const c = code(sql());
    assert.match(c, /if v_login and v_neu then/);
    assert.match(c, /queue_mail\('team_member_added', p_person_id, jsonb_build_object\('roles_de', v_de, 'roles_en', v_en\), 'person', null\)/);
    assert.ok(!/p_email|p_mail/.test(c), "kein Adress-Argument");
    // „Rolle neu“: keine **gültige** Zuweisung derselben Rolle im selben Geltungsbereich
    assert.match(c, /ra\.valid_to is null or ra\.valid_to > now\(\)/);
    assert.match(c, /ra\.edition_id is not distinct from v_ed/);
  });

  it("das Audit nennt keine Adresse", () => {
    const audit = code(sql()).match(/log_audit\('access\.team_role'[^;]*;/)?.[0] ?? "";
    assert.ok(audit.length > 0);
    assert.doesNotMatch(audit, /email|mail_to|to_email/i);
    assert.match(audit, /'mail', v_mail/);
  });
});

describe("grant_team_role: die Oberfläche", () => {
  const actions = quelle(`${DIR}/actions.ts`);
  const liste = quelle(`${DIR}/ZugaengeListe.tsx`);
  const aufnehmen = quelle(`${DIR}/PersonAufnehmen.tsx`);

  it("`grantTeamRole` ruft `grant_team_role`, nicht mehr `assign_role`, und prüft zuerst den Abschnitt access", () => {
    const rumpf = actions.slice(actions.indexOf("export async function grantTeamRole"), actions.indexOf("export async function revokeTeamRole"));
    assert.match(rumpf, /await requireAdminSection\("access", PFAD\);/);
    assert.match(rumpf, /rpc\("grant_team_role"/);
    assert.doesNotMatch(rumpf, /rpc\("assign_role"/);
    assert.match(rumpf, /p_edition_id: role !== "admin" && editionId \? editionId : null/);
  });

  it("beide Wege sagen im Hinweis, was aus der Mail wurde (eingereiht · gesperrte Adresse · Rolle schon da)", () => {
    for (const text of [liste, aufnehmen]) {
      assert.match(text, /!res\.neu \? t\.grantedAlready : res\.mail === "queued" \? t\.grantedMailQueued : res\.mail === "suppressed" \? t\.grantedMailSuppressed : t\.granted/);
    }
  });

  it("die Texte stehen in DE und EN", () => {
    for (const f of ["lib/i18n/de.json", "lib/i18n/en.json"]) {
      const a = (JSON.parse(quelle(f)) as { accessAdmin: Record<string, string> }).accessAdmin;
      for (const k of ["grantedAlready", "grantedMailQueued", "grantedMailSuppressed"]) assert.ok(a[k], `${f}: ${k}`);
    }
  });
});
