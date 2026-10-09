import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { berlinerTag, leistungenZusammenfassen, nachbuchungsText } from "@/components/partner/leistungen";
import { migrationText } from "@/tests/migration-datei";

/**
 * PART-102 / PART-100: Nachbuchungen (zweiter Deal) in der Leistungsliste. Die Datenbank-Seite (`nachgebucht_am`, Folge-Deal ohne Kontakte, die
 * Rollen bleiben) belegt `supabase/tests/v6_nachbuchung.sql` (16 Erwartungen, echter Rollenwechsel, 11 Mutationen); hier steht, was das Portal daraus
 * macht: eine Zeile je Leistung, der Nachbuchungs-Anteil mit Datum, stornierte Leistungen zählen nicht — und dass Datenbank, Typen und Seiten
 * dasselbe Feld meinen.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(quelle(`lib/i18n/${sprache}.json`)) as {
    partner: Record<string, string>;
    adminPartner: Record<string, string>;
  };

const zeile = (sku: string, qty: number, extra: Partial<{ status: string; nachgebucht_am: string | null; name_de: string }> = {}) => ({
  sku,
  name_de: extra.name_de ?? `Leistung ${sku}`,
  name_en: null,
  category: "addon",
  qty,
  status: extra.status ?? "booked",
  nachgebucht_am: extra.nachgebucht_am ?? null,
});

describe("PART-102: eine Zeile je Leistung", () => {
  it("dieselbe SKU aus zwei Deals ergibt einen Eintrag mit der Summe — der Nachbuchungs-Anteil steht dabei", () => {
    const z = leistungenZusammenfassen([
      zeile("I-32776", 4),
      zeile("I-32776", 2, { nachgebucht_am: "2026-10-12T09:00:00Z" }),
      zeile("I-50131", 1),
    ]);
    assert.equal(z.length, 2);
    assert.equal(z[0].sku, "I-32776");
    assert.equal(z[0].qty, 6);
    assert.deepEqual(z[0].nachgebucht, { qty: 2, am: ["2026-10-12T09:00:00Z"] });
    assert.equal(z[1].nachgebucht, null, "die Erstbuchung trägt keinen Nachbuchungs-Anteil");
  });

  it("die Reihenfolge der ersten Fundstelle bleibt (die Datenbank sortiert nach Art und Name)", () => {
    const z = leistungenZusammenfassen([zeile("B", 1), zeile("A", 1), zeile("B", 1, { nachgebucht_am: "2026-10-12T09:00:00Z" })]);
    assert.deepEqual(z.map((x) => x.sku), ["B", "A"]);
  });

  it("Mengen kommen aus dem JSON auch als Zeichenkette an (numeric) und werden gezählt", () => {
    const z = leistungenZusammenfassen([{ ...zeile("X", 0), qty: "1.00" }, { ...zeile("X", 0), qty: "2.50", nachgebucht_am: "2026-10-12T09:00:00Z" }]);
    assert.equal(z[0].qty, 3.5);
    assert.equal(z[0].nachgebucht?.qty, 2.5);
  });

  it("keine Leistungen: eine leere Liste, kein Fehler", () => {
    assert.deepEqual(leistungenZusammenfassen([]), []);
    assert.deepEqual(leistungenZusammenfassen(null), []);
    assert.deepEqual(leistungenZusammenfassen(undefined), []);
  });
});

describe("PART-102: stornierte Leistungen", () => {
  it("eine stornierte Zeile zählt nicht zur Menge, solange die SKU noch gebucht ist", () => {
    const z = leistungenZusammenfassen([zeile("I-1", 3, { status: "cancelled" }), zeile("I-1", 2)]);
    assert.equal(z[0].qty, 2);
    assert.equal(z[0].storniert, false);
  });

  it("eine ganz stornierte SKU ist `storniert` (das Portal lässt sie weg, der Admin zeigt sie) und trägt keinen Nachbuchungs-Satz", () => {
    const z = leistungenZusammenfassen([zeile("I-1", 3, { status: "cancelled", nachgebucht_am: "2026-10-12T09:00:00Z" })]);
    assert.equal(z[0].storniert, true);
    assert.equal(z[0].qty, 3, "der Admin sieht die stornierte Menge");
    assert.equal(z[0].nachgebucht, null);
    assert.equal(nachbuchungsText(z[0], { davon: "davon {n} am {date}", ganz: "am {date}" }, (i) => i), null);
  });

  it("der Satz entfällt auch, wenn jemand eine stornierte Zeile mit Nachbuchungs-Anteil von Hand übergibt (eigene Wache, nicht nur die Zusammenfassung)", () => {
    const von_hand = { qty: 3, storniert: true, nachgebucht: { qty: 1, am: ["2026-10-12T09:00:00Z"] } };
    assert.equal(nachbuchungsText(von_hand, { davon: "davon {n} am {date}", ganz: "am {date}" }, (i) => i), null);
    assert.equal(nachbuchungsText({ ...von_hand, storniert: false }, { davon: "davon {n} am {date}", ganz: "am {date}" }, (i) => i), "davon 1 am 2026-10-12T09:00:00Z");
  });

  it("eine stornierte Nachbuchung lässt die Erstbuchung stehen und nennt keinen Nachbuchungs-Anteil", () => {
    const z = leistungenZusammenfassen([zeile("I-1", 3), zeile("I-1", 2, { status: "cancelled", nachgebucht_am: "2026-10-12T09:00:00Z" })]);
    assert.equal(z[0].qty, 3);
    assert.equal(z[0].nachgebucht, null);
  });
});

describe("PART-102: das Datum der Nachbuchung", () => {
  it("der Kalendertag zählt in Hamburg, nicht in UTC (22:30 UTC im Sommer ist schon der nächste Tag)", () => {
    assert.equal(berlinerTag("2026-10-12T22:30:00Z"), "2026-10-13");
    assert.equal(berlinerTag("2026-10-12T09:00:00Z"), "2026-10-12");
    assert.equal(berlinerTag("2026-12-31T23:30:00Z"), "2027-01-01");
  });

  it("zwei Nachbuchungen am selben Tag stehen als ein Datum da, zwei Tage aufsteigend", () => {
    const am = (spaeter: string[]) =>
      leistungenZusammenfassen([zeile("I-1", 1), ...spaeter.map((t) => zeile("I-1", 1, { nachgebucht_am: t }))])[0].nachgebucht?.am;
    assert.deepEqual(am(["2026-10-12T15:00:00Z", "2026-10-12T07:00:00Z"]), ["2026-10-12T07:00:00Z"]);
    assert.deepEqual(am(["2026-10-20T09:00:00Z", "2026-10-12T09:00:00Z"]), ["2026-10-12T09:00:00Z", "2026-10-20T09:00:00Z"]);
  });

  const texte = { davon: "davon {n} nachgebucht am {date}", ganz: "nachgebucht am {date}" };
  const datum = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

  it("ein Teil nachgebucht: „davon 2 nachgebucht am 12.10.2026“", () => {
    const z = leistungenZusammenfassen([zeile("I-1", 8), zeile("I-1", 2, { nachgebucht_am: "2026-10-12T09:00:00Z" })])[0];
    assert.equal(nachbuchungsText(z, texte, datum), "davon 2 nachgebucht am 12.10.2026");
  });

  it("alles nachgebucht: „nachgebucht am 12.10.2026“ — ohne „davon“", () => {
    const z = leistungenZusammenfassen([zeile("I-9", 1, { nachgebucht_am: "2026-10-12T09:00:00Z" })])[0];
    assert.equal(nachbuchungsText(z, texte, datum), "nachgebucht am 12.10.2026");
  });

  it("mehrere Tage mit Komma; nichts nachgebucht: kein Satz", () => {
    const z = leistungenZusammenfassen([
      zeile("I-1", 5),
      zeile("I-1", 1, { nachgebucht_am: "2026-10-12T09:00:00Z" }),
      zeile("I-1", 2, { nachgebucht_am: "2026-10-20T09:00:00Z" }),
    ])[0];
    assert.equal(nachbuchungsText(z, texte, datum), "davon 3 nachgebucht am 12.10.2026, 20.10.2026");
    assert.equal(nachbuchungsText(leistungenZusammenfassen([zeile("I-1", 5)])[0], texte, datum), null);
  });
});

describe("PART-102: Datenbank, Typen und Seiten meinen dasselbe Feld", () => {
  it("die Migration liefert `nachgebucht_am` in `partner_overview.products[]` und legt die Spalte an", () => {
    const sql = migrationText("v6_nachbuchung").replace(/--[^\n]*/g, "");
    assert.match(sql, /alter table org_product add column if not exists nachgebucht_am timestamptz;/);
    assert.match(sql, /'format_key', pr\.format_key, 'nachgebucht_am', op\.nachgebucht_am\) order by pr\.type, pr\.name_de\)/);
  });

  it("der Ingest setzt das Feld nur beim Anlegen und nur, wenn die Org-Edition schon einen Deal hat", () => {
    const sql = migrationText("v6_nachbuchung").replace(/--[^\n]*/g, "");
    assert.match(sql, /v_nachbuchung := exists \(select 1 from partner_deal pd where pd\.org_edition_id = v_oe_id\);\s+insert into partner_deal/);
    assert.match(sql, /case when v_nachbuchung then now\(\) end\)/);
    assert.ok(!/do update set[^;]*nachgebucht_am/.test(sql), "der Konflikt-Zweig darf den Zeitpunkt nicht überschreiben");
  });

  it("die TypeScript-Typen führen das Feld (Portal und Admin)", () => {
    assert.match(quelle("app/(partner)/partner/types.ts"), /nachgebucht_am\?: string \| null;/);
    assert.match(quelle("app/(admin)/admin/partner/[org]/types.ts"), /nachgebucht_am\?: string \| null;/);
  });
});

describe("PART-100/102: die Seiten (Quelltext-Prüfung — kein Render, JSX lädt der Testlader nicht)", () => {
  it("Portal: je Leistung eine Zeile mit Trennlinien, stornierte fehlen, die Kennzahl zählt Leistungen", () => {
    const seite = quelle("app/(partner)/partner/page.tsx");
    assert.match(seite, /leistungenZusammenfassen\(o\.products\)\.filter\(\(z\) => !z\.storniert\)/);
    assert.match(seite, /<ul className="mt-2 flex flex-col divide-y divide-border">\s+\{leistungen\.map\(\(z\) => \{/);
    assert.match(seite, /<StatCard label=\{t\.partner\.statProducts\} value=\{leistungen\.length\} \/>/);
    assert.match(seite, /\{ davon: t\.partner\.productsRebooked, ganz: t\.partner\.productsRebookedAll \}/);
    assert.ok(!/o\.products\.map\(/.test(seite), "die Liste darf nicht wieder je Buchungszeile laufen");
  });

  it("Admin: die Karte „Gebucht“ fasst zusammen und zeigt auch stornierte Leistungen mit ihrem Stand", () => {
    const seite = quelle("app/(admin)/admin/partner/[org]/OrgDetail.tsx");
    assert.match(seite, /const leistungen = leistungenZusammenfassen\(overview\.products\);/);
    assert.match(seite, /\{ davon: t\.bookedRebooked, ganz: t\.bookedRebookedAll \}/);
    assert.match(seite, /\{z\.storniert \? "cancelled" : "booked"\}/);
    assert.ok(!/overview\.products\.map\(/.test(seite));
  });
});

describe("PART-102: die Texte", () => {
  for (const sprache of ["de", "en"] as const) {
    it(`${sprache}: Portal und Admin haben beide Sätze mit {n} und {date}`, () => {
      const w = woerterbuch(sprache);
      for (const [name, satz] of [
        ["partner.productsRebooked", w.partner.productsRebooked],
        ["adminPartner.bookedRebooked", w.adminPartner.bookedRebooked],
      ]) {
        assert.match(satz, /\{n\}/, `${sprache}.${name}`);
        assert.match(satz, /\{date\}/, `${sprache}.${name}`);
      }
      for (const [name, satz] of [
        ["partner.productsRebookedAll", w.partner.productsRebookedAll],
        ["adminPartner.bookedRebookedAll", w.adminPartner.bookedRebookedAll],
      ]) {
        assert.match(satz, /\{date\}/, `${sprache}.${name}`);
        assert.ok(!/\{n\}/.test(satz), `${sprache}.${name}: „ganz“ nennt keine Teilmenge`);
      }
    });
  }
});

describe("PART-102: der Testdaten-Schritt `nachbuchung` (Quelltext-Prüfung)", () => {
  const skript = quelle("scripts/testdaten-konrad.mjs");

  it("er legt einen zweiten Deal und zwei Nachbuchungs-Zeilen ohne Pass-Typ an und lässt den Zeitpunkt beim zweiten Lauf stehen", () => {
    assert.match(skript, /const NACHBUCHUNG_DEAL = "ZZTEST-DEAL-2";/);
    assert.match(skript, /nachgebucht_am: jetzt,/);
    // Beide Schreibwege lassen Vorhandenes stehen: die Deals und die Leistungen samt Zeitpunkt.
    assert.match(skript, /\{ onConflict: "hubspot_deal_id", ignoreDuplicates: true \}/);
    assert.match(skript, /\{ onConflict: "org_edition_id,product_sku,hubspot_line_item_id", ignoreDuplicates: true \}/);
    assert.match(skript, /if \(mitPass\) \{\s+return fail\("Nachbuchung", `\$\{mitPass\.sku\} trägt einen Pass-Typ — würde ein vivenu-Kontingent auslösen/);
    assert.match(skript, /nachbuchung: nachbuchungSchritt,/);
  });

  it("`--remove` nimmt die beiden Test-Deals mit", () => {
    assert.match(skript, /partner_deal"\)\.delete\(\)\.like\("hubspot_deal_id", "ZZTEST-DEAL-%"\)/);
  });
});
