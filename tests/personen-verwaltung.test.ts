import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  KONTO_FILTER,
  SORTIERUNG,
  kontoDerZeile,
  kuerzen,
  leseKonto,
  leseSortierung,
  listenAdresse,
} from "@/lib/personen/liste";

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
type Woerterbuch = {
  admin: { persons: Record<string, string>; personDetail: Record<string, string> };
  rpc: Record<string, string>;
  auditAction: Record<string, string>;
};
const de = JSON.parse(lies("lib/i18n/de.json")) as Woerterbuch;
const en = JSON.parse(lies("lib/i18n/en.json")) as Woerterbuch;

describe("Personenliste: Filter aus der Adresse (ADM-091)", () => {
  it("nur bekannte Konto-Status und Sortierungen kommen durch — ein Tippfehler zeigt die Liste, keine Fehlerseite", () => {
    for (const k of KONTO_FILTER) assert.equal(leseKonto(k), k);
    assert.equal(leseKonto("bunt"), "");
    assert.equal(leseKonto(undefined), "");
    for (const s of SORTIERUNG) assert.equal(leseSortierung(s), s);
    assert.equal(leseSortierung("zufall"), "neu");
    assert.equal(leseSortierung(undefined), "neu");
  });

  it("die Datenbank kennt dieselben Werte wie die Seite", () => {
    const sql = migrationText("v6_personen_verwaltung");
    for (const k of KONTO_FILTER) assert.ok(sql.includes(`'${k}'`), `Konto-Status ${k}`);
    for (const s of SORTIERUNG) assert.ok(sql.includes(`'${s}'`), `Sortierung ${s}`);
  });

  it("das Konto-Kennzeichen folgt dem Gewicht: gelöscht, gesperrt, Löschantrag, dann Login", () => {
    const z = { deleted_at: null, blocked_at: null, deletion_pending: false, has_login: true };
    assert.equal(kontoDerZeile(z), "login");
    assert.equal(kontoDerZeile({ ...z, has_login: false }), "ohne_login");
    assert.equal(kontoDerZeile({ ...z, deletion_pending: true }), "antrag");
    assert.equal(kontoDerZeile({ ...z, deletion_pending: true, blocked_at: "2026-10-01" }), "gesperrt");
    assert.equal(kontoDerZeile({ ...z, blocked_at: "2026-10-01", deleted_at: "2026-10-02" }), "geloescht");
  });

  it("lange Zellen werden gekürzt und sagen, wie viel fehlt", () => {
    assert.deepEqual(kuerzen(["a", "b"], 3), { sichtbar: ["a", "b"], weitere: 0 });
    assert.deepEqual(kuerzen(["a", "b", "c", "d", "e"], 3), { sichtbar: ["a", "b", "c"], weitere: 2 });
    assert.deepEqual(kuerzen([], 3), { sichtbar: [], weitere: 0 });
  });

  it("die Adresse trägt nur, was gesetzt ist; Standardwerte und Seite 1 fehlen", () => {
    assert.equal(listenAdresse("/admin/personen", {}), "/admin/personen");
    assert.equal(listenAdresse("/admin/personen", { sort: "neu", seite: 1 }), "/admin/personen");
    assert.equal(
      listenAdresse("/admin/personen", { q: "max m", rolle: "admin", edition: "e-1", konto: "gesperrt", sort: "name", seite: 3 }),
      "/admin/personen?q=max+m&rolle=admin&edition=e-1&konto=gesperrt&sort=name&seite=3",
    );
  });
});

describe("Personen: Migration (ADM-091, ADM-092)", () => {
  const sql = migrationText("v6_personen_verwaltung");

  it("alle drei Funktionen prüfen den Abschnitt persons und sind gehärtet", () => {
    for (const fn of ["persons_admin_list", "update_person_master", "manage_person_email"]) {
      const von = sql.indexOf(`create or replace function ${fn}(`);
      assert.ok(von >= 0, fn);
      const bis = sql.indexOf("end $$;", von);
      const rumpf = sql.slice(von, bis);
      assert.match(rumpf, /has_admin_section\('persons'\)/, `${fn}: Rechteprüfung`);
      assert.match(rumpf, /SECURITY DEFINER/i, `${fn}: Definer`);
      assert.match(rumpf, /SET search_path TO 'public', 'extensions'/, `${fn}: search_path gepinnt`);
    }
    assert.match(sql.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("das Protokoll trägt nie eine Adresse, und Telefon und Geburtsdatum nur als Feldname", () => {
    const mail = sql.slice(sql.indexOf("create or replace function manage_person_email"));
    for (const [, argumente] of mail.matchAll(/log_audit\(([^;]*)\);/g)) {
      assert.ok(!/'email'\s*,/.test(argumente), `Adresse im Protokoll: ${argumente.slice(0, 80)}`);
      assert.ok(/email_hash/.test(argumente), "Hash statt Adresse");
    }
    assert.match(sql, /v_still constant text\[\] := array\['birthdate', 'phone'\]/);
  });

  it("die Funktionen nehmen nur die Stammdatenfelder an, nichts mit Rechten oder Konto", () => {
    const felder = /v_felder constant text\[\] := array\[([^\]]*)\]/.exec(sql)?.[1] ?? "";
    for (const f of ["first_name", "last_name", "title", "birthdate", "gender", "nationality", "country", "city", "phone", "linkedin_url", "preferred_language"]) {
      assert.ok(felder.includes(`'${f}'`), f);
    }
    for (const f of ["auth_user_id", "tier", "deleted_at", "access_blocked_at", "phone_e164", "cv_path", "photo_path"]) {
      assert.ok(!felder.includes(`'${f}'`), `${f} darf nicht änderbar sein`);
    }
  });

  it("Adresse berichtigen geht nur ohne Login; die primäre bleibt", () => {
    assert.match(sql, /if v_login then raise exception 'login_email_locked'/);
    assert.match(sql, /if v_zeile\.is_primary then raise exception 'primary_email_required'/);
  });
});

describe("Personen: Oberfläche (ADM-091, ADM-092)", () => {
  it("Liste und Änderungen laufen über die Sitzung, nicht über den Admin-Client", () => {
    const liste = lies("app/(admin)/admin/personen/page.tsx");
    assert.match(liste, /persons_admin_list/);
    assert.ok(!/createSupabaseAdminClient/.test(liste), "die Liste liest nicht mit dem Admin-Schlüssel");
    const aktionen = lies("app/(admin)/admin/personen/[id]/actions.ts");
    for (const rpc of ["update_person_master", "manage_person_email"]) assert.match(aktionen, new RegExp(rpc));
    const bearbeiten = aktionen.slice(aktionen.indexOf("export async function saveMasterData"));
    assert.ok(!/createSupabaseAdminClient/.test(bearbeiten), "Schreiben nie mit dem Admin-Client");
    assert.match(bearbeiten, /requireAdminSection\("persons"/);
  });

  it("die Einzelansicht bietet das Bearbeiten und blendet es für anonymisierte Personen aus", () => {
    const seite = lies("app/(admin)/admin/personen/[id]/page.tsx");
    assert.match(seite, /<StammdatenBearbeiten/);
    assert.match(seite, /<EmailVerwaltung/);
    assert.match(seite, /!person\.deleted_at && \(\s*<StammdatenBearbeiten/);
    assert.match(seite, /readOnly=\{Boolean\(person\.deleted_at\)\}/);
  });

  it("jeder Schlüssel, den die Komponenten lesen, steht in DE und EN", () => {
    const quellen: [string, Record<string, string>[]][] = [
      ["app/(admin)/admin/personen/PersonenFilter.tsx", [de.admin.persons, en.admin.persons]],
      ["app/(admin)/admin/personen/page.tsx", [de.admin.persons, en.admin.persons]],
      ["app/(admin)/admin/personen/[id]/StammdatenBearbeiten.tsx", [de.admin.personDetail, en.admin.personDetail]],
      ["app/(admin)/admin/personen/[id]/EmailVerwaltung.tsx", [de.admin.personDetail, en.admin.personDetail]],
    ];
    for (const [datei, woerterbuecher] of quellen) {
      const text = lies(datei);
      const schluessel = new Set([...text.matchAll(/\b(?:t|p)\.([a-zA-Z_]+[a-zA-Z0-9_]*)\b/g)].map((m) => m[1]));
      // Dynamische Schlüssel: account_<k>, filterAccount_<k>, sort_<s>, field_<feld> stehen unten einzeln.
      for (const k of schluessel) {
        if (["meta", "common", "admin"].includes(k)) continue;
        for (const w of woerterbuecher) assert.ok(k in w || ["common"].includes(k), `${datei}: ${k}`);
      }
    }
    for (const w of [de.admin.persons, en.admin.persons]) {
      for (const k of KONTO_FILTER) assert.ok(w[`filterAccount_${k}`], `filterAccount_${k}`);
      for (const k of ["login", "ohne_login", "gesperrt", "antrag", "geloescht"]) assert.ok(w[`account_${k}`], `account_${k}`);
      for (const s of SORTIERUNG) assert.ok(w[`sort_${s}`], `sort_${s}`);
    }
    for (const w of [de.admin.personDetail, en.admin.personDetail]) {
      for (const f of ["first_name", "last_name", "title", "birthdate", "gender", "nationality", "country", "city", "phone", "linkedin_url", "preferred_language"]) {
        assert.ok(w[`field_${f}`], `field_${f}`);
      }
    }
  });

  it("Fehlerschlüssel und Protokollnamen sind übersetzt", () => {
    const keys = lies("lib/rpc-error.ts");
    for (const k of ["invalid_person_field", "person_email_taken", "person_anonymized", "login_email_locked", "primary_email_required", "email_not_found"]) {
      assert.ok(keys.includes(`"${k}"`), `BUSINESS_KEYS ${k}`);
      assert.ok(de.rpc[k], `de.rpc ${k}`);
      assert.ok(en.rpc[k], `en.rpc ${k}`);
    }
    for (const a of ["person.master_updated", "person.email_add", "person.email_primary", "person.email_remove", "person.email_change"]) {
      assert.ok(de.auditAction[a], `de ${a}`);
      assert.ok(en.auditAction[a], `en ${a}`);
    }
  });
});
