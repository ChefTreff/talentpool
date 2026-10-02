import { csvCell } from "@/lib/csv";
import type { BoothItem, BoothReview, SupplierRow } from "@/app/(admin)/admin/produktion/types";

/**
 * Reine Teile der Produktionsliste je Stand (PROD-004) und der internen
 * Prüfung (PROD-005) — ohne React, damit die Tests sie laden. Die Mengen
 * kommen aus `booth_production_lines` in der Datenbank; hier steht nur, wie
 * sie angezeigt, gezählt und als CSV ausgegeben werden.
 */

/** `numeric` kommt aus einer RPC-Antwort je nach Weg als Zahl oder als Text. */
export function zahl(wert: unknown): number {
  const n = typeof wert === "number" ? wert : Number(wert);
  return Number.isFinite(n) ? n : 0;
}

type Quellen = Pick<BoothItem, "qty_package" | "qty_offer" | "qty_shop" | "qty_shop_open">;

export type HerkunftTeil = {
  art: "package" | "offer" | "shop";
  menge: number;
  /** Nur beim Shop: der Teil, der noch nicht abgeschlossen ist und sich bis zur Frist ändern kann. */
  offen: number;
};

/** Woher die Menge stammt, in fester Reihenfolge (Paket, Angebot, Shop); was null ist, fällt weg. */
export function herkunft(q: Quellen): HerkunftTeil[] {
  const teile: HerkunftTeil[] = [];
  if (zahl(q.qty_package) > 0) teile.push({ art: "package", menge: zahl(q.qty_package), offen: 0 });
  if (zahl(q.qty_offer) > 0) teile.push({ art: "offer", menge: zahl(q.qty_offer), offen: 0 });
  if (zahl(q.qty_shop) > 0) teile.push({ art: "shop", menge: zahl(q.qty_shop), offen: zahl(q.qty_shop_open) });
  return teile;
}

export type Pruefzustand = "open" | "ok" | "problem";

/** Ein Prüfpunkt ohne Eintrag ist offen; `stale` steht daneben und ersetzt den Zustand nicht. */
export function pruefzustand(r: Pick<BoothReview, "status">): Pruefzustand {
  return r.status === "ok" ? "ok" : r.status === "problem" ? "problem" : "open";
}

export type PruefZaehler = {
  staende: number;
  /** Prüfpunkte ohne Eintrag. */
  offen: number;
  /** `ok` und seit der Prüfung nichts geändert. */
  ok: number;
  /** `problem` — auch wenn sich seitdem etwas geändert hat, die Notiz bleibt gültig. */
  problem: number;
  /** `ok`, aber die Bestellung hat sich danach geändert. */
  veraltet: number;
};

/** Die Zahlen über der Liste: wie viele Prüfpunkte stehen wo. */
export function pruefZaehler(staende: { reviews: Pick<BoothReview, "status" | "stale">[] }[]): PruefZaehler {
  const z: PruefZaehler = { staende: staende.length, offen: 0, ok: 0, problem: 0, veraltet: 0 };
  for (const s of staende) {
    for (const r of s.reviews) {
      const zustand = pruefzustand(r);
      if (zustand === "open") z.offen += 1;
      else if (zustand === "problem") z.problem += 1;
      else if (r.stale) z.veraltet += 1;
      else z.ok += 1;
    }
  }
  return z;
}

/** Eine CSV-Zeile mit Semikolon — jede Zelle über `lib/csv.ts` (Formelschutz). */
function zeile(zellen: unknown[]): string {
  return zellen.map(csvCell).join(";");
}

export const STAND_CSV_KOPF = [
  "Stand",
  "Standnummer",
  "Artikelnummer",
  "Leistung",
  "Dienstleister",
  "Menge",
  "Einheit",
  "Paket",
  "Angebot",
  "Shop",
  "Shop noch offen",
  "Geliefert",
] as const;

/** Produktionsliste je Stand als CSV-Zeilen (ohne BOM, mit Kopfzeile). */
export function standCsv(items: BoothItem[]): string[] {
  return [
    zeile([...STAND_CSV_KOPF]),
    ...items.map((i) =>
      zeile([
        i.org_name,
        i.booth_number ?? "",
        i.product_sku,
        i.product_name,
        i.supplier ?? "",
        zahl(i.qty),
        i.unit ?? "",
        zahl(i.qty_package),
        zahl(i.qty_offer),
        zahl(i.qty_shop),
        zahl(i.qty_shop_open),
        i.checked ? "ja" : "nein",
      ]),
    ),
  ];
}

export const LIEFERANTEN_CSV_KOPF = [
  "Dienstleister",
  "Artikelnummer",
  "Leistung",
  "Menge",
  "Einheit",
  "davon Paket",
  "davon Angebot",
  "davon Shop",
  "davon Shop noch offen",
  "Stände",
  "EK je Einheit",
  "EK gesamt",
] as const;

/** Bestellliste je Dienstleister als CSV-Zeilen (ohne BOM, mit Kopfzeile). */
export function lieferantenCsv(rows: SupplierRow[]): string[] {
  return [
    zeile([...LIEFERANTEN_CSV_KOPF]),
    ...rows.map((r) => {
      const menge = zahl(r.qty);
      return zeile([
        r.supplier,
        r.product_sku,
        r.product_name,
        menge,
        r.unit ?? "",
        zahl(r.qty_package),
        zahl(r.qty_offer),
        zahl(r.qty_shop),
        zahl(r.qty_shop_open),
        r.orgs,
        r.purchase_price_cents == null ? "" : (r.purchase_price_cents / 100).toFixed(2),
        r.purchase_price_cents == null ? "" : ((r.purchase_price_cents * menge) / 100).toFixed(2),
      ]);
    }),
  ];
}
