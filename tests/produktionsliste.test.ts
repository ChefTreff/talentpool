import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  herkunft,
  LIEFERANTEN_CSV_KOPF,
  lieferantenCsv,
  pruefZaehler,
  pruefzustand,
  STAND_CSV_KOPF,
  standCsv,
  zahl,
} from "@/lib/produktion/staende";
import { ADMIN_SECTIONS, adminSection } from "@/lib/admin-sections";
import type { BoothItem, SupplierRow } from "@/app/(admin)/admin/produktion/types";
import de from "@/lib/i18n/de.json" with { type: "json" };
import en from "@/lib/i18n/en.json" with { type: "json" };

const sql = () => migrationText("v6_produktionsliste_stand");
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** Den Text einer Funktion aus der Migration schneiden — von `create … function <name>` bis zum nächsten. */
const funktion = (text: string, name: string) => {
  const start = text.search(new RegExp(`create (?:or replace )?function ${name}\\(`));
  assert.ok(start >= 0, `Funktion ${name} fehlt in der Migration`);
  const rest = text.slice(start + 10);
  const ende = rest.search(/\ncreate (?:or replace )?function |\ncomment on function |\nselect harden_definer_functions/);
  return text.slice(start, ende < 0 ? undefined : start + 10 + ende);
};

const posten = (s: Partial<BoothItem> = {}): BoothItem => ({
  org_edition_id: "oe1",
  org_id: "o1",
  org_name: "Muster GmbH",
  booth_number: "A-12",
  product_sku: "I-53563",
  product_name: "Tolix Barhocker",
  supplier: "partyrent",
  qty: 6,
  checked: false,
  checked_at: null,
  checked_by_name: null,
  note: null,
  unit: "piece",
  qty_package: 2,
  qty_offer: 0,
  qty_shop: 4,
  qty_shop_open: 4,
  ...s,
});

describe("Lieferantenliste: CSV als echter Download (PROD-004)", () => {
  it("lädt über ButtonDownload von der Admin-Adresse, nicht über einen vorladenden Link auf /produktion", () => {
    const seite = src("app/(admin)/admin/produktion/bestellungen/page.tsx");
    assert.match(seite, /<ButtonDownload[\s\S]*href=\{`\/admin\/produktion\/bestellungen\/csv/);
    assert.doesNotMatch(seite, /ButtonLink/);
    assert.doesNotMatch(seite, /["`]\/produktion\//);
  });

  it("die Stand-Liste hat ihre CSV-Knöpfe ebenfalls als Download (alle Stände und je Stand)", () => {
    const liste = src("app/(admin)/admin/produktion/BoothChecklist.tsx");
    assert.match(liste, /<ButtonDownload[\s\S]*href="\/admin\/produktion\/staende\/csv"/);
    assert.match(liste, /\/admin\/produktion\/staende\/csv\?stand=/);
    assert.doesNotMatch(liste, /ButtonLink/);
  });
});

describe("Herkunft einer Menge (PROD-004)", () => {
  it("nennt Paket, Angebot und Shop in fester Reihenfolge und lässt Nullen weg", () => {
    assert.deepEqual(herkunft({ qty_package: 2, qty_offer: 0, qty_shop: 4, qty_shop_open: 1 }), [
      { art: "package", menge: 2, offen: 0 },
      { art: "shop", menge: 4, offen: 1 },
    ]);
    assert.deepEqual(herkunft({ qty_package: 4, qty_offer: 2, qty_shop: 0, qty_shop_open: 0 }).map((t) => t.art), [
      "package",
      "offer",
    ]);
    assert.deepEqual(herkunft({ qty_package: 0, qty_offer: 0, qty_shop: 0, qty_shop_open: 0 }), []);
  });

  it("liest numeric auch als Text und behandelt Müll als null", () => {
    assert.equal(zahl("2.50"), 2.5);
    assert.equal(zahl("x"), 0);
    assert.equal(zahl(null), 0);
    assert.deepEqual(herkunft({ qty_package: "2.00" as never, qty_offer: "" as never, qty_shop: "0" as never, qty_shop_open: "0" as never }), [
      { art: "package", menge: 2, offen: 0 },
    ]);
  });
});

describe("Zahlen der Prüfung (PROD-005)", () => {
  it("zählt je Prüfpunkt und Stand: offen, passt, passt nicht, veraltet", () => {
    const z = pruefZaehler([
      { reviews: [{ status: null, stale: false }] },
      { reviews: [{ status: "ok", stale: false }] },
      { reviews: [{ status: "ok", stale: true }] },
      { reviews: [{ status: "problem", stale: false }] },
      // Eine Notiz „passt nicht“ bleibt gültig, auch wenn sich die Bestellung seitdem geändert hat.
      { reviews: [{ status: "problem", stale: true }] },
      { reviews: [] },
    ]);
    assert.deepEqual(z, { staende: 6, offen: 1, ok: 1, problem: 2, veraltet: 1 });
  });

  it("ein Punkt ohne Eintrag ist offen", () => {
    assert.equal(pruefzustand({ status: null }), "open");
    assert.equal(pruefzustand({ status: "ok" }), "ok");
    assert.equal(pruefzustand({ status: "problem" }), "problem");
  });
});

describe("CSV: Produktionsliste je Stand und Bestellliste", () => {
  it("die Stand-Liste hat Kopf, Herkunft in drei Spalten und Zahlen als Zahlen", () => {
    const zeilen = standCsv([posten({ checked: true })]);
    assert.equal(zeilen.length, 2);
    assert.equal(zeilen[0], STAND_CSV_KOPF.map((k) => `"${k}"`).join(";"));
    assert.equal(
      zeilen[1],
      '"Muster GmbH";"A-12";"I-53563";"Tolix Barhocker";"partyrent";"6";"piece";"2";"0";"4";"4";"ja"',
    );
  });

  it("entschärft Formelanfänge in Namen und Standnummern", () => {
    const zeilen = standCsv([posten({ org_name: '=HYPERLINK("http://x","klick")', product_name: "+1+1", booth_number: "@A" })]);
    assert.ok(zeilen[1].startsWith('" =HYPERLINK(""http://x"",""klick"")";" @A";'));
    assert.match(zeilen[1], /;" \+1\+1";/);
    const lieferanten = lieferantenCsv([
      { supplier: "=cmd", product_sku: "I-1", product_name: "-2+3", unit: null, qty: 1, orgs: 1, purchase_price_cents: null, qty_package: 1, qty_offer: 0, qty_shop: 0, qty_shop_open: 0 },
    ]);
    assert.match(lieferanten[1], /^" =cmd";"I-1";" -2\+3";/);
  });

  it("die Bestellliste weist die drei Anteile aus und rechnet den Einkaufspreis aus der Gesamtmenge", () => {
    const rows: SupplierRow[] = [
      {
        supplier: "partyrent",
        product_sku: "I-53563",
        product_name: "Tolix Barhocker",
        unit: "piece",
        qty: 6,
        orgs: 2,
        purchase_price_cents: 1250,
        qty_package: 2,
        qty_offer: 0,
        qty_shop: 4,
        qty_shop_open: 3,
      },
      { supplier: "", product_sku: "I-2", product_name: "Ohne Preis", unit: null, qty: 1, orgs: 1, purchase_price_cents: null, qty_package: 1, qty_offer: 0, qty_shop: 0, qty_shop_open: 0 },
    ];
    const zeilen = lieferantenCsv(rows);
    assert.equal(zeilen[0], LIEFERANTEN_CSV_KOPF.map((k) => `"${k}"`).join(";"));
    assert.equal(zeilen[1], '"partyrent";"I-53563";"Tolix Barhocker";"6";"piece";"2";"0";"4";"3";"2";"12.50";"75.00"');
    assert.equal(zeilen[2], '"";"I-2";"Ohne Preis";"1";"";"1";"0";"0";"0";"1";"";""');
  });

  it("beide Routen nutzen den Formelschutz aus lib/csv.ts und schreiben das BOM ausdrücklich", () => {
    assert.match(src("lib/produktion/staende.ts"), /import \{ csvCell \} from "@\/lib\/csv"/);
    for (const route of ["app/(admin)/admin/produktion/bestellungen/csv/route.ts", "app/(admin)/admin/produktion/staende/csv/route.ts"]) {
      const text = src(route);
      assert.match(text, /"\\uFEFF" \+/);
      assert.doesNotMatch(text, /﻿/, `${route}: das BOM steht als unsichtbares Zeichen im Quelltext`);
    }
    // Der Dateiname kommt zum Teil aus der Adresse bzw. dem Namen der Organisation: nur [a-z0-9-].
    assert.match(src("app/(admin)/admin/produktion/bestellungen/csv/route.ts"), /replace\(\/\[\^a-z0-9\]\+\/g, "-"\)/);
    assert.match(src("app/(admin)/admin/produktion/staende/csv/route.ts"), /replace\(\/\[\^a-z0-9\]\+\/g, "-"\)/);
  });
});

describe("Migration v6_produktionsliste_stand: Rechte", () => {
  it("die fünf öffentlichen Funktionen prüfen den Abschnitt, nicht mehr is_production_team()", () => {
    const text = sql();
    for (const name of ["booth_checklist", "set_booth_service_check", "set_booth_review", "booth_production_summary"]) {
      const f = funktion(text, name);
      assert.match(f, /has_admin_section\('productionBooths'\)/, name);
      assert.doesNotMatch(f, /is_production_team\(\)/, name);
      assert.match(f, /errcode = '42501'/, name);
    }
    const lieferanten = funktion(text, "supplier_order_list");
    assert.match(lieferanten, /has_admin_section\('productionOrders'\)/);
    assert.doesNotMatch(lieferanten, /is_production_team\(\)/);
  });

  it("die Abschnittsschlüssel gibt es, mit denselben Rollen wie bisher die Produktion", () => {
    for (const key of ["productionBooths", "productionOrders"] as const) {
      assert.ok(ADMIN_SECTIONS.some((s) => s.key === key), key);
      assert.deepEqual([...adminSection(key).roles], ["production_team", "area_lead_production"]);
    }
  });

  it("die zwei internen Hilfen sind für Clients nicht aufrufbar, die fünf öffentlichen nur für authenticated", () => {
    const text = sql();
    assert.match(text, /revoke execute on function booth_production_lines\(uuid, uuid\) from public, anon, authenticated;/);
    assert.match(text, /revoke execute on function booth_basis_hash\(uuid, uuid\) from public, anon, authenticated;/);
    for (const sig of [
      "booth_checklist\\(uuid, uuid\\)",
      "supplier_order_list\\(uuid, text\\)",
      "set_booth_service_check\\(uuid, text, boolean, text\\)",
      "set_booth_review\\(uuid, text, text, text\\)",
      "booth_production_summary\\(uuid\\)",
    ]) {
      assert.match(text, new RegExp(`grant execute on function ${sig} to authenticated;`), sig);
    }
    assert.doesNotMatch(text, /to anon/);
  });

  it("alle sieben Funktionen sind SECURITY DEFINER mit festem search_path; die Migration endet mit harden_definer_functions", () => {
    const text = sql();
    for (const name of [
      "booth_production_lines",
      "booth_basis_hash",
      "booth_checklist",
      "supplier_order_list",
      "set_booth_service_check",
      "set_booth_review",
      "booth_production_summary",
    ]) {
      const f = funktion(text, name);
      assert.match(f, /security definer/i, name);
      assert.match(f, /set search_path (?:=|to) '?public'?, '?extensions'?/i, name);
    }
    assert.match(text.trimEnd(), /select harden_definer_functions\(\);$/);
  });

  it("booth_review hat RLS und keine Grants für Clients", () => {
    const text = sql();
    assert.match(text, /alter table booth_review enable row level security;/);
    assert.match(text, /revoke all on booth_review from anon, authenticated;/);
    assert.doesNotMatch(text, /grant [a-z, ]+ on booth_review to (?:anon|authenticated)/);
  });
});

describe("Migration v6_produktionsliste_stand: Zählregeln", () => {
  it("Shop zählt pending, editing und completed; offen sind pending und editing; Warenkorb und Storno zählen nicht", () => {
    const f = funktion(sql(), "booth_production_lines");
    // Nur der Shop-Teil: bei Angebot und Paket steht 'cancelled' zu Recht (stornierte Leistungen).
    const shop = f.slice(f.indexOf("-- Messeshop"), f.indexOf("select s.oe_id"));
    assert.match(shop, /so\.status in \('pending', 'editing', 'completed'\)/);
    assert.match(shop, /when so\.status in \('pending', 'editing'\) then sl\.qty/);
    assert.doesNotMatch(shop, /'draft'|'cancelled'/);
  });

  it("Angebot und Paketausstattung lassen Stornierte aus, das Paket selbst ist keine Lieferung", () => {
    const f = funktion(sql(), "booth_production_lines");
    assert.equal((f.match(/op\.status <> 'cancelled'/g) ?? []).length, 2);
    assert.match(f, /join product_component pc on pc\.bundle_sku = op\.product_sku/);
    assert.match(f, /p\.type in \('shop_item', 'addon'\)/);
    assert.match(f, /coalesce\(p\.category, ''\) <> 'tickets'/);
    assert.match(f, /p\.pass_type is null/);
  });

  it("Haken setzen verlangt die Position, Haken nehmen nicht", () => {
    const f = funktion(sql(), "set_booth_service_check");
    const setzen = f.slice(f.indexOf("if p_checked then"), f.indexOf("else\n"));
    assert.match(setzen, /booth_production_lines\(v_edition, v_org\)/);
    assert.match(setzen, /booth_item_not_found/);
    const nehmen = f.slice(f.indexOf("else\n"), f.indexOf("end if;\n  perform log_audit"));
    assert.doesNotMatch(nehmen, /booth_item_not_found/);
    assert.match(nehmen, /delete from booth_service_check/);
  });

  it("die Prüfung verlangt eine Notiz bei „passt nicht“ und merkt sich den Fingerabdruck", () => {
    const f = funktion(sql(), "set_booth_review");
    assert.match(f, /note_required/);
    assert.match(f, /invalid_status/);
    assert.match(f, /invalid_vocab_value/);
    assert.match(f, /booth_basis_hash\(v_oe\.edition_id, v_oe\.org_id\)/);
    assert.match(f, /log_audit\('booth\.review'/);
    assert.match(sql(), /constraint booth_review_problem_note_chk check \(status = 'ok' or nullif\(btrim\(coalesce\(note, ''\)\), ''\) is not null\)/);
  });

  it("das Vokabular der Prüfpunkte ist an die Spalte gebunden", () => {
    const text = sql();
    assert.match(text, /\('booth_review_item', 'orders_fit_size', 'Bestellungen passen zur Standgröße', 'Orders fit the booth size', 1, true\)/);
    assert.match(text, /\('booth_review_item', 'booth_review', 'item_key', false,/);
  });
});

describe("Seiten und Schreibwege der Produktion", () => {
  it("Haken und Prüfung gehen über den Abschnitt productionBooths, auch am Gate der Aktion", () => {
    const actions = src("app/(admin)/admin/produktion/actions.ts");
    assert.match(actions, /async function client\(section: "production" \| "productionBooths" = "production"\)/);
    assert.match(actions, /export async function setBoothCheck[\s\S]*?client\("productionBooths"\)/);
    assert.match(actions, /export async function setBoothReview[\s\S]*?client\("productionBooths"\)/);
    assert.match(actions, /rpc\("set_booth_review"/);
  });

  it("die Seiten und CSV-Routen haben das Gate ihres Abschnitts", () => {
    assert.match(src("app/(admin)/admin/produktion/staende/page.tsx"), /requireAdminSection\("productionBooths", "\/admin\/produktion\/staende"\)/);
    assert.match(src("app/(admin)/admin/produktion/staende/csv/route.ts"), /requireAdminSection\("productionBooths"/);
    assert.match(src("app/(admin)/admin/produktion/bestellungen/page.tsx"), /requireAdminSection\("productionOrders"/);
    assert.match(src("app/(admin)/admin/produktion/bestellungen/csv/route.ts"), /requireAdminSection\("productionOrders"/);
  });

  it("ein Fehler der Datenbank ist keine leere Liste: die Lader der Stände und Lieferanten werfen", () => {
    const load = src("app/(admin)/admin/produktion/load.ts");
    for (const rpc of ["booth_checklist", "booth_production_summary", "supplier_order_list"]) {
      assert.match(load, new RegExp(`if \\(error\\) throw new Error\\(\`${rpc}: `), rpc);
    }
  });

  it("Prüfung: Fehler stehen im Formular, nicht im Toast; „passt nicht“ verlangt die Notiz vorab", () => {
    const p = src("app/(admin)/admin/produktion/Pruefung.tsx");
    assert.match(p, /role="alert"/);
    assert.doesNotMatch(p, /useToast|toast\(/);
    assert.match(p, /if \(!notiz\.trim\(\)\)/);
    assert.match(p, /t\.reviewNoteRequired/);
  });
});

describe("Texte DE und EN", () => {
  const benutzt = (datei: string, muster: RegExp) => [...src(datei).matchAll(muster)].map((m) => m[1]);

  it("jeder Schlüssel der Stand-Liste, der Prüfung und der Bestellliste steht in beiden Sprachen", () => {
    const schluessel = new Set([
      ...benutzt("app/(admin)/admin/produktion/BoothChecklist.tsx", /\bt\.([a-zA-Z]+)\b/g),
      ...benutzt("app/(admin)/admin/produktion/Pruefung.tsx", /\bt\.([a-zA-Z]+)\b/g),
      ...benutzt("app/(admin)/admin/produktion/Herkunft.tsx", /\bt\.([a-zA-Z]+)\b/g),
      ...benutzt("app/(admin)/admin/produktion/bestellungen/page.tsx", /t\.production\.([a-zA-Z]+)\b/g),
      ...benutzt("app/(admin)/admin/produktion/staende/page.tsx", /t\.production\.([a-zA-Z]+)\b/g),
    ]);
    // `cancel` kommt als `t.common.cancel` über die Seite, `replace`/`format` sind Methoden.
    for (const ausnahme of ["cancel", "replace", "format"]) schluessel.delete(ausnahme);
    assert.ok(schluessel.size > 30, `nur ${schluessel.size} Schlüssel gefunden — Muster prüfen`);
    for (const [sprache, dict] of [
      ["de", de],
      ["en", en],
    ] as const) {
      const p = dict.production as Record<string, string>;
      const fehlt = [...schluessel].filter((k) => typeof p[k] !== "string" || p[k] === "");
      assert.deepEqual(fehlt, [], `${sprache}: production`);
    }
  });

  it("die Platzhalter der neuen Texte stehen in beiden Sprachen gleich", () => {
    for (const key of ["summaryLine", "sizeSqm", "sizeDays", "sizeBooth", "srcPackage", "srcOffer", "srcShop", "srcShopOpen"]) {
      const platz = (s: string) => [...s.matchAll(/\{[a-z]+\}/g)].map((m) => m[0]).sort().join(",");
      assert.equal(platz((de.production as Record<string, string>)[key]), platz((en.production as Record<string, string>)[key]), key);
    }
  });
});
