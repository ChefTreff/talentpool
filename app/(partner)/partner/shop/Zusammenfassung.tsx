import type { Locale } from "@/lib/i18n/shared";
import { describeMerch, type MerchField } from "@/lib/partner/merch";
import type { ShopOrder } from "../types";

type Strings = Record<string, string>;

/**
 * Konfiguration einer Zeile in einem Satz. `empty` sagt, dass noch etwas
 * fehlt — ohne Text bleibt die Zeile stumm (Historie).
 */
export function MerchSummary({
  fields,
  config,
  locale,
  empty,
}: {
  fields: MerchField[] | undefined;
  config: Record<string, unknown> | null;
  locale: Locale;
  empty?: string;
}) {
  if (!fields) return null;
  const rows = describeMerch(fields, config, locale);
  if (rows.length === 0)
    return empty ? <span className="ct-help block text-error-ink">{empty}</span> : null;
  return (
    <span className="ct-help block">{rows.map((r) => `${r.label}: ${r.value}`).join(" · ")}</span>
  );
}

/** Netto, USt, brutto — dieselbe Zeile im Warenkorb und in der Historie. */
export function Totals({
  order,
  dateLocale,
  t,
}: {
  order: ShopOrder;
  dateLocale: string;
  t: Strings;
}) {
  const money = (cents: number) =>
    (cents / 100).toLocaleString(dateLocale, { style: "currency", currency: "EUR" });
  return (
    <dl className="ct-help mt-3 flex flex-wrap gap-x-4 gap-y-1">
      <div className="flex gap-1">
        <dt className="font-semibold">{t.net}:</dt>
        <dd className="tabular-nums">{money(order.net_cents)}</dd>
      </div>
      <div className="flex gap-1">
        <dt className="font-semibold">{t.vat}:</dt>
        <dd className="tabular-nums">{money(order.vat_cents)}</dd>
      </div>
      <div className="flex gap-1">
        <dt className="font-semibold">{t.gross}:</dt>
        <dd className="tabular-nums">{money(order.gross_cents)}</dd>
      </div>
    </dl>
  );
}
