import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const sql = migrationText("v6_auskuenfte_weg");
const code = sql.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

/** Alle Quelldateien unter app/, components/, lib/ (ohne Wörterbücher). */
function quellen(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return quellen(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("Allgemeine Zeiten und Auskünfte abschaffen (ADM-100)", () => {
  it("die Löschsperre steht vor dem ersten drop: eine Zeile in edition_info bricht die Migration ab", () => {
    const sperre = code.indexOf("raise exception 'edition_info_not_empty'");
    const ersterDrop = code.search(/drop (function|table)/);
    assert.ok(sperre > 0 && ersterDrop > 0 && sperre < ersterDrop);
    assert.match(code, /if exists \(select 1 from edition_info\) then/);
  });

  it("entfernt genau die Tabelle und die fünf Funktionen, nichts davon mit cascade", () => {
    for (const f of ["edition_infos(text, uuid)", "edition_infos_admin(uuid)", "upsert_edition_info(jsonb)", "delete_edition_info(uuid)", "can_edit_edition_info()"]) {
      assert.ok(code.includes(`drop function if exists ${f};`), f);
    }
    assert.match(code, /drop table if exists edition_info;/);
    assert.doesNotMatch(code, /cascade/i);
    assert.doesNotMatch(code, /edition_contact\b/, "die Ansprechpartner bleiben unberührt");
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("kein Code unter app/, components/ und lib/ liest, schreibt oder zeigt die Auskünfte noch", () => {
    const treffer: string[] = [];
    for (const d of ["app", "components", "lib"]) {
      for (const f of quellen(d)) {
        const text = readFileSync(f, "utf8");
        if (/edition_infos?\b|upsert_edition_info|delete_edition_info|can_edit_edition_info|loadEditionInfos|AdminInfo\b|saveInfo|removeInfo/.test(text)) treffer.push(f);
      }
    }
    assert.deepEqual(treffer, []);
  });

  it("die Partner-Startseite zeigt keinen Kasten „Zeiten“ mehr, der Ansprechpartner-Kasten bleibt", () => {
    const seite = readFileSync("app/(partner)/partner/page.tsx", "utf8");
    assert.doesNotMatch(seite, /timesTitle|zeiten/);
    assert.match(seite, /<Ansprechpartner/);
    assert.match(seite, /loadMyContacts\(/);
  });

  it("die Admin-Seite lädt weiter die Ansprechpartner und nur die", () => {
    const seite = readFileSync("app/(admin)/admin/ansprechpartner/page.tsx", "utf8");
    assert.match(seite, /rpc\("edition_contacts_admin"\)/);
    assert.doesNotMatch(seite, /edition_infos/);
  });

  it("die Wörterbücher führen die Schlüssel der Auskünfte nicht mehr, DE und EN", () => {
    for (const l of ["de", "en"]) {
      const d = JSON.parse(readFileSync(`lib/i18n/${l}.json`, "utf8")) as { contacts: Record<string, string>; rpc: Record<string, string>; admin: { nav: Record<string, string> } };
      for (const k of ["infosTitle", "addInfo", "editInfo", "emptyInfos", "emptyInfosBody", "fieldValueDe", "fieldValueEn"]) assert.equal(d.contacts[k], undefined, `${l}.contacts.${k}`);
      assert.equal(d.rpc.info_not_found, undefined);
      assert.doesNotMatch(d.admin.nav.contacts, /times|Zeiten/i);
    }
  });
});
