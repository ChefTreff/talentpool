import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

const sql = migrationText("v6_spalten_kontaktschluessel");
const ohneKommentar = sql.replace(/--[^\n]*/g, "");

function quelltexte(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...quelltexte(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("QS-075: tote Spalten weg, Kontaktschlüssel ableiten (ADM-108)", () => {
  it("löscht genau die drei Spalten und prüft vorher, dass sie leer sind", () => {
    assert.match(ohneKommentar, /alter table organization drop column logo_dark, drop column logo_light;/);
    assert.match(ohneKommentar, /alter table org_edition drop column notes_internal;/);
    assert.match(ohneKommentar, /raise exception 'Spalten nicht leer/);
    assert.ok(ohneKommentar.indexOf("raise exception 'Spalten nicht leer") < ohneKommentar.indexOf("drop column"), "Zählprobe muss vor dem Löschen stehen");
  });

  it("partner_overview gibt die Logo-Schlüssel nicht mehr aus", () => {
    const rumpf = ohneKommentar.split("create or replace function partner_overview")[1].split("alter table organization drop column")[0];
    assert.doesNotMatch(rumpf, /logo_dark|logo_light/);
    assert.match(rumpf, /'customer_number', v_o\.customer_number/);
  });

  it("kein Code liest die gestrichenen Organisationsspalten", () => {
    const treffer = [...quelltexte("app"), ...quelltexte("lib"), ...quelltexte("components")]
      .filter((f) => /\blogo_(dark|light)\b/.test(readFileSync(f, "utf8")));
    assert.deepEqual(treffer, []);
  });

  it("der Trigger hängt an den vier Spalten, wirft nie und lässt Update ohne diese Spalten in Ruhe", () => {
    assert.match(ohneKommentar, /create trigger trg_person_contact_keys before insert or update of phone, phone_e164, linkedin_url, linkedin_normalized on person/);
    const fn = ohneKommentar.split("create or replace function person_derive_contact_keys")[1].split("drop trigger")[0];
    assert.doesNotMatch(fn, /raise exception/);
    assert.match(fn, /SET search_path TO 'public', 'extensions'/);
  });

  it("Normalisierer sind unveränderlich, mit festem search_path, und die Migration endet gehärtet", () => {
    for (const name of ["normalize_phone_e164", "normalize_linkedin_url"]) {
      const f = ohneKommentar.split(`create or replace function ${name}`)[1].split("$$;")[0];
      assert.match(f, /IMMUTABLE/);
      assert.match(f, /SET search_path TO 'public', 'extensions'/);
    }
    assert.match(sql, /select harden_definer_functions\(\);\s*$/);
  });

  it("Backfill leitet nur ab, was fehlt, und überschreibt keine lesbare Angabe mit null", () => {
    assert.match(ohneKommentar, /where phone is not null and phone_e164 is null and normalize_phone_e164\(phone\) is not null/);
    assert.match(ohneKommentar, /where linkedin_url is not null and linkedin_normalized is null and normalize_linkedin_url\(linkedin_url\) is not null/);
  });
});
