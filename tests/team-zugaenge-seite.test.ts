import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import { ADMIN_NAVIGATION } from "@/lib/admin-navigation";
import { ADMIN_SECTIONS } from "@/lib/admin-sections";

/**
 * ADM-094: Team und Zugänge sind **eine** Seite. Der Test hält das Versprechen der Analyse
 * (`docs/analyse-team-zugaenge-2026-10-08.md`, Abschnitt 4): **nichts entfällt** — jede Funktion der drei alten
 * Seiten gibt es weiter, hinter demselben Abschnitt.
 */
const lies = (p: string) => readFileSync(p, "utf8");
const DIR = "app/(admin)/admin/verwaltung/zugaenge";
const actions = lies(`${DIR}/actions.ts`);
const page = lies(`${DIR}/page.tsx`);
const liste = lies(`${DIR}/ZugaengeListe.tsx`);
const kopf = lies(`${DIR}/ZugaengeKopf.tsx`);
const de = JSON.parse(lies("lib/i18n/de.json"));
const en = JSON.parse(lies("lib/i18n/en.json"));

function aktionen(text: string): string[] {
  return [...text.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
}

describe("Team & Zugänge: nichts geht verloren (ADM-094)", () => {
  it("jede Funktion der alten Seiten Team und Zugänge steht in den Aktionen", () => {
    for (const name of ["findPeople", "grantTeamRole", "revokeTeamRole", "setzeZugang", "ladeEin", "legeGeraetAn", "ladeTeamEin"]) {
      assert.ok(aktionen(actions).includes(name), name);
    }
  });

  it("jede Aktion prüft zuerst den Abschnitt access, keine einen anderen", () => {
    for (const name of aktionen(actions)) {
      const start = actions.indexOf(`export async function ${name}(`);
      const rumpf = actions.slice(start, actions.indexOf("\nexport ", start + 10) === -1 ? undefined : actions.indexOf("\nexport ", start + 10));
      assert.match(rumpf, /await requireAdminSection\("access", PFAD\)/, name);
      assert.doesNotMatch(rumpf, /requireAdminSection\("team"/, name);
    }
  });

  it("die Seite liest die vier Mengen aus team_access_list und kennt die Filter", () => {
    assert.match(page, /rpc\("team_access_list"/);
    assert.match(page, /\["team", "alle", "gesperrt", "ohne_login"\]/);
    assert.doesNotMatch(page, /team_members|access_accounts/);
    assert.match(page, /\? \(filterRoh as ZugaengeFilter\) : "team"/);
  });

  it("die Liste bietet je Zustand genau einen Handgriff und den Selbstschutz", () => {
    assert.match(liste, /k\.blocked_at \? \(\s*<Button[\s\S]*?fragen\("oeffnen"/);
    assert.match(liste, /fragen\("einladen"/);
    assert.equal((liste.match(/<MenuItem onSelect=\{\(\) => fragen\("sperren"/g) ?? []).length, 1, "Sperren steht bei Aktiv und Ohne Login im selben ⋯-Menü (ADM-109)");
    assert.doesNotMatch(liste, /<Button[^>]*>\s*\{t\.block\}/);
    assert.match(liste, /revokeTeamRole\(aktuell\.rolle\.id\)/);
    assert.match(liste, /konto\.admins <= 1/);
    assert.match(liste, /grantTeamRole\(ziel\.person_id, neueRolle, geltung === "edition" \? editionId : null\)/);
    assert.match(liste, /neueRolle === "admin" \? "global" : geltung/);
  });

  it("die Kopfleiste hat vier Filter als Links mit Zahl, Einladen und Gerät anlegen", () => {
    assert.match(kopf, /ChipLink/);
    for (const f of ["filterTeam", "filterAlle", "filterGesperrt", "filterOhneLogin", "addMember", "openDevice"]) assert.match(kopf, new RegExp(f), f);
  });

  it("neun Protokollaktionen werden weiter geschrieben (an den Funktionen, die die Seite aufruft)", () => {
    const snap = (n: string) => lies(`supabase/snapshot/functions/${n}.sql`);
    assert.match(snap("assign_role"), /'role\.assign'/);
    assert.match(snap("revoke_role"), /'role\.revoke'/);
    assert.match(snap("log_access_invite"), /'access\.invited'/);
    assert.match(snap("set_person_access"), /'access\.blocked'/);
    assert.match(snap("set_person_access"), /'access\.unblocked'/);
    assert.match(snap("create_team_member"), /'access\.team_member'/);
    assert.match(snap("create_kiosk_account"), /'access\.kiosk_account'/);
    assert.match(snap("set_admin_section_override"), /'admin_section\.override'/);
    assert.match(snap("delete_admin_section_override"), /'admin_section\.override_removed'/);
  });
});

describe("Team & Zugänge: ein Abschnitt, ein Menüpunkt, eine Adresse", () => {
  it("der Abschnitt team ist weg, access bleibt unter seinem Pfad", () => {
    assert.equal(ADMIN_SECTIONS.some((s) => (s.key as string) === "team"), false);
    assert.equal(ADMIN_SECTIONS.find((s) => s.key === "access")?.path, "/admin/verwaltung/zugaenge");
  });

  it("die Leiste hat einen Punkt statt zwei, beschriftet „Team & Zugänge“", () => {
    const punkte = ADMIN_NAVIGATION.flatMap((g) => g.punkte);
    assert.equal(punkte.some((p) => p.href === "/admin/team"), false);
    assert.equal(punkte.filter((p) => p.section === "access").length, 1);
    assert.equal(de.admin.nav.access, "Team & Zugänge");
    assert.equal(en.admin.nav.access, "Team & access");
  });

  it("/admin/team leitet um, hinter demselben Gate", () => {
    const alt = lies("app/(admin)/admin/team/page.tsx");
    assert.match(alt, /requireAdminSection\("access", "\/admin\/team"\)/);
    assert.match(alt, /redirect\("\/admin\/verwaltung\/zugaenge"\)/);
    assert.deepEqual(readdirSync("app/(admin)/admin/team"), ["page.tsx"]);
  });

  it("nichts im Code ruft team_members() oder den Abschnitt team noch auf", () => {
    for (const verzeichnis of ["app", "lib", "components"]) {
      const sammle = (d: string): string[] =>
        readdirSync(d, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? sammle(`${d}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${d}/${e.name}`] : [],
        );
      for (const datei of sammle(verzeichnis)) {
        const text = lies(datei);
        assert.doesNotMatch(text, /rpc\("team_members"/, datei);
        assert.doesNotMatch(text, /requireAdminSection\("team"/, datei);
      }
    }
  });
});

describe("Team & Zugänge: Migration", () => {
  const sql = migrationText("v6_team_zugaenge_zusammen");

  it("nimmt den Abschnitt aus der Zuordnung, entfernt die Ausnahmen und die Funktion", () => {
    assert.match(sql, /delete from admin_section_role where section = 'team' and role = 'admin';/);
    assert.match(sql, /delete from admin_section_override where section = 'team';/);
    assert.match(sql, /drop function if exists team_members\(\);/);
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("übernimmt Ausnahmen nicht nach access (das wäre mehr Recht als je gewollt)", () => {
    assert.doesNotMatch(sql, /update admin_section_override/i);
    assert.doesNotMatch(sql, /insert into admin_section_override/i);
  });

  it("eine Funktion der alten Seite bleibt: access_accounts dient dem Test als Gegenprobe", () => {
    assert.ok(existsSync("supabase/snapshot/functions/access_accounts.sql"));
    assert.doesNotMatch(sql, /drop function[^;]*access_accounts/i);
  });
});

describe("Team & Zugänge: Texte", () => {
  it("jeder Schlüssel, den die Seite aus accessAdmin liest, steht in DE und EN", () => {
    const benutzt = new Set<string>();
    for (const text of [page, liste, kopf, lies(`${DIR}/PersonAufnehmen.tsx`), lies(`${DIR}/TeamEinladung.tsx`), lies(`${DIR}/Geraetekonto.tsx`)]) {
      for (const m of text.matchAll(/\bt\.([a-zA-Z]+)\b/g)) benutzt.add(m[1]);
      for (const m of text.matchAll(/strings\.([a-zA-Z]+)\b/g)) benutzt.add(m[1]);
    }
    // `t.common`, `t.meta`, `t.admin`, `t.rpc`, `t.accessAdmin` sind Gruppen der Seite, keine Schlüssel.
    for (const gruppe of ["common", "meta", "admin", "rpc", "accessAdmin"]) benutzt.delete(gruppe);
    for (const key of benutzt) {
      assert.ok(key in de.accessAdmin, `de: ${key}`);
      assert.ok(key in en.accessAdmin, `en: ${key}`);
    }
  });

  it("die alte Gruppe adminTeam ist aufgegangen", () => {
    assert.equal("adminTeam" in de, false);
    assert.equal("adminTeam" in en, false);
  });
});
