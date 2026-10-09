import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";

/**
 * PART-116 (Konrad & Leopold 05.10., K-81 08.10.), Teil 1 — das Angebot aus dem Messeshop-Warenkorb, Datenbank-Seite. Die Datenbank belegt
 * `supabase/tests/v6_shop_angebot.sql` (echter Rollenwechsel, Route als service_role, 83 Erwartungen mit Auswertung, 85 Mutationsproben). Hier steht, was sich
 * ohne Datenbank festhalten lässt: die Form der Migration (Quelltext-Prüfung — gelesen wird der Text, nichts läuft) und dass jeder Fehlerschlüssel der neuen
 * Funktionen in `BUSINESS_KEYS` und in beiden Wörterbüchern steht. Route, SevDesk-Aufrufe und Oberfläche (Teil 2) folgen nach „Migration live“.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") => JSON.parse(quelle(`lib/i18n/${sprache}.json`));
const migration = () => migrationText("v6_shop_angebot");
/** Kommentare raus: ein Satz, der etwas erwähnt, ist keine Anweisung. */
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");

const NEUE_FUNKTIONEN = [
  "shop_quote_lines_hash", "shop_quote_begin", "record_shop_quote", "shop_quote_abort",
  "shop_quote_withdraw", "shop_quote_info", "shop_quotes_admin", "shop_quotes_housekeeping",
];
/** Was jede geänderte Funktion vom Angebot wissen muss (die Datenbank belegt das Verhalten, hier steht die Stelle im Text). */
const GEAENDERTE_FUNKTIONEN: Record<string, RegExp> = {
  shop_upsert_line: /status in \('draft', 'pending', 'editing', 'quoted'\) for update/,
  shop_remove_line: /v_o\.status = 'quoted' then raise exception 'order_quoted'/,
  shop_confirm: /v_o\.status not in \('draft', 'editing', 'quoted'\)/,
  shop_cancel: /v_o\.status not in \('draft', 'pending', 'editing', 'quoted'\)/,
  shop_admin_set_status: /v_o\.status = 'quoted' and p_status <> 'cancelled' then raise exception 'order_quoted'/,
  shop_admin_set_line: /v_o\.status = 'quoted' then raise exception 'order_quoted'/,
  shop_orders_admin: /when 'quoted' then 1/,
  run_shop_finalization: /o\.status in \('draft', 'pending', 'editing', 'quoted'\)/,
  // der Lauf kennt das Angebot nur über den Aufruf der Aufräumfunktion
  run_partner_housekeeping: /v_quotes := shop_quotes_housekeeping\(\);/,
};
const SCHLUESSEL = [
  "order_quoted", "not_quoted", "quote_customer_number_required", "quote_country_unsupported", "quote_address_incomplete",
  "quote_limit_reached", "quote_expired", "quote_in_progress", "quote_hash_mismatch", "quote_recorded", "quote_id_required",
];

/** Der Text einer Funktion: von „create or replace function <name>(“ bis zum nächsten „create or replace function“ oder Abschnittskopf. */
function funktion(sql: string, name: string): string {
  const m = new RegExp(`create or replace function ${name}\\(([\\s\\S]*?)(?=\\ncreate or replace function |\\n-- ===|\\nselect harden_definer_functions|$)`).exec(sql);
  assert.ok(m, `Funktion ${name} nicht gefunden`);
  return m[0];
}

describe("PART-116: Migration v6_shop_angebot (Quelltext-Prüfung)", () => {
  it("führt die Spalten, den Status und den Teilindex ein", () => {
    const sql = code(migration());
    assert.match(sql, /alter table shop_order add column if not exists quote_started_at timestamptz;/);
    assert.match(sql, /alter table shop_order add column if not exists quote_valid_until timestamptz;/);
    assert.match(sql, /check \(status in \('draft', 'pending', 'editing', 'quoted', 'completed', 'cancelled'\)\)/);
    assert.match(sql, /create unique index shop_order_active_uidx on shop_order \(org_edition_id, phase\) where status in \('draft', 'pending', 'editing', 'quoted'\);/);
  });

  it("jede neue Funktion ist SECURITY DEFINER mit gepinntem search_path", () => {
    const sql = code(migration());
    for (const name of NEUE_FUNKTIONEN) {
      const f = funktion(sql, name);
      assert.match(f, /security definer/i, `${name}: security definer`);
      assert.match(f, /set search_path to 'public', 'extensions'/, `${name}: search_path`);
    }
  });

  it("alle geänderten Funktionen kommen aus dem Snapshot und kennen das Angebot (`quoted`)", () => {
    const sql = code(migration());
    for (const [name, stelle] of Object.entries(GEAENDERTE_FUNKTIONEN)) assert.match(funktion(sql, name), stelle, name);
    // der Lauf ruft erst die Angebote, dann die Phasenabschlüsse auf (ein verfallenes Angebot ist danach ein Entwurf, den der Abschluss mitnimmt)
    const lauf = funktion(sql, "run_partner_housekeeping");
    assert.ok(lauf.indexOf("shop_quotes_housekeeping()") < lauf.indexOf("run_shop_finalization()"));
  });

  it("die internen Funktionen sind für Aufrufer gesperrt, record und abort prüfen zusätzlich auth.uid()", () => {
    const sql = code(migration());
    for (const sig of [
      "shop_quote_lines_hash(uuid)",
      "record_shop_quote(uuid, text, text, text, bigint, text, boolean)",
      "shop_quote_abort(uuid, text)",
      "shop_quotes_housekeeping()",
    ]) {
      assert.ok(sql.includes(`revoke execute on function ${sig} from public, anon, authenticated;`), `revoke ${sig}`);
    }
    for (const name of ["record_shop_quote", "shop_quote_abort"]) {
      assert.match(funktion(sql, name), /if auth\.uid\(\) is not null then raise exception 'not allowed' using errcode = '42501'; end if;/, `${name}: Wache`);
    }
    // die Funktionen für Partner und Team prüfen das Recht selbst
    for (const name of ["shop_quote_begin", "shop_quote_withdraw"]) assert.match(funktion(sql, name), /partner_can_edit\(/, name);
    assert.match(funktion(sql, "shop_quote_info"), /is_partner_of\(v_org\) or is_partner_team\(\)/);
    assert.match(funktion(sql, "shop_quotes_admin"), /if not is_partner_team\(\) then raise exception 'not allowed' using errcode = '42501'; end if;/);
  });

  it("endet mit harden_definer_functions, ohne doppeltes Semikolon hinter einem Funktionsende", () => {
    const sql = migration();
    assert.ok(code(sql).trim().endsWith("select harden_definer_functions();"));
    assert.ok(!sql.includes("$$;;"), "„$$;;“ kommt aus den Snapshots und gehört nicht in die Migration");
  });

  it("das Audit trägt keine Adresse: weder Straße noch PLZ noch Ort noch Kontaktdaten in den log_audit-Aufrufen der Angebots-Funktionen", () => {
    const sql = code(migration());
    for (const name of ["shop_quote_begin", "record_shop_quote", "shop_quote_abort", "shop_quote_withdraw"]) {
      for (const m of funktion(sql, name).matchAll(/log_audit\([^;]*;/g)) {
        assert.doesNotMatch(m[0], /address_|street|zip|city|email|invoice_/i, `${name}: ${m[0].slice(0, 80)}`);
      }
    }
  });
});

describe("PART-116: Fehlerschlüssel der Angebots-Funktionen", () => {
  it("jeder `raise exception` der neuen Funktionen nennt einen Schlüssel aus BUSINESS_KEYS — und alle elf neuen werden ausgelöst", () => {
    const sql = code(migration());
    const r = quelle("lib/rpc-error.ts");
    const aus = (name: string) => [...funktion(sql, name).matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]);
    const neue = new Set(NEUE_FUNKTIONEN.flatMap(aus));
    for (const k of neue) assert.ok(r.includes(`"${k}",`), `BUSINESS_KEYS: ${k}`);
    // die geänderten Funktionen bringen die Sperre und die Prüfungen beim Bestellen mit
    const gesehen = new Set([...neue, ...["shop_confirm", "shop_upsert_line", "shop_remove_line", "shop_admin_set_line", "shop_admin_set_status"].flatMap(aus)]);
    for (const k of SCHLUESSEL) assert.ok(gesehen.has(k), `Migration löst ${k} nicht aus`);
    for (const name of ["shop_upsert_line", "shop_remove_line", "shop_admin_set_line", "shop_admin_set_status"]) {
      assert.ok(aus(name).includes("order_quoted"), `${name}: order_quoted`);
    }
    for (const k of ["quote_expired", "quote_in_progress"]) assert.ok(aus("shop_confirm").includes(k), `shop_confirm: ${k}`);
  });

  it("die neuen Schlüssel stehen in BUSINESS_KEYS und in beiden Wörterbüchern, verschieden je Sprache", () => {
    const r = quelle("lib/rpc-error.ts");
    for (const k of SCHLUESSEL) assert.ok(r.includes(`"${k}",`), `BUSINESS_KEYS: ${k}`);
    const de = woerterbuch("de").rpc;
    const en = woerterbuch("en").rpc;
    for (const k of SCHLUESSEL) {
      assert.ok(typeof de[k] === "string" && de[k].length > 10, `de.rpc.${k}`);
      assert.ok(typeof en[k] === "string" && en[k].length > 10, `en.rpc.${k}`);
      assert.notEqual(de[k], en[k], `${k}: DE und EN sind verschieden`);
    }
  });

  it("die Meldungen für Partner sagen, was zu tun ist (ihr-Ansprache, kein „Sie“)", () => {
    const de = woerterbuch("de").rpc;
    for (const k of ["order_quoted", "quote_customer_number_required", "quote_address_incomplete", "quote_limit_reached", "quote_expired"]) {
      assert.doesNotMatch(de[k], /\bSie\b|\bIhre?\b/, k);
    }
    assert.match(de.order_quoted, /zurück|bestellt/i);
    assert.match(de.quote_customer_number_required, /Team/);
    assert.match(de.quote_country_unsupported, /Team/);
  });
});
