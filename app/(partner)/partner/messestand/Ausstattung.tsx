import type { Locale } from "@/lib/i18n/shared";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { BoothPackage } from "./types";

type Strings = Record<string, string>;

/**
 * Was in welchem Stand steckt.
 *
 * Die Ausstattung kommt aus der Stückliste des Produkts (`product_component`) —
 * derselben Liste, aus der die Produktion bestellt. Sie hier noch einmal als
 * Text zu pflegen, hiesse, zwei Wahrheiten zu haben; im zweiten Jahr stimmt
 * dann eine davon nicht mehr.
 *
 * Das eigene Paket steht **oben** und ist gekennzeichnet: die erste Frage an
 * dieser Tabelle lautet „was habe ich gebucht", nicht „was gibt es".
 */
export function Ausstattung({
  packages,
  ownSkus,
  locale,
  t,
}: {
  packages: BoothPackage[];
  ownSkus: readonly string[];
  locale: Locale;
  t: Strings;
}) {
  const name = (p: BoothPackage) => (locale === "en" ? (p.name_en ?? p.name_de) : p.name_de);
  const own = new Set(ownSkus);
  // Eigenes Paket zuerst, danach die übrigen in ihrer Reihenfolge (Fläche).
  const sortiert = [...packages].sort(
    (a, b) => Number(own.has(b.sku)) - Number(own.has(a.sku)),
  );

  return (
    <Card className="p-0">
      {/* Die Tabelle scrollt in ihrem eigenen Kasten; die Seite nie. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b">
              <th scope="col" className="ct-label px-4 py-2.5 text-left text-muted">
                {t.colPackage}
              </th>
              <th scope="col" className="ct-label w-[180px] px-4 py-2.5 text-left text-muted">
                {t.colSize}
              </th>
              <th scope="col" className="ct-label px-4 py-2.5 text-left text-muted">
                {t.colEquip}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortiert.map((p) => {
              const meins = own.has(p.sku);
              return (
                <tr
                  key={p.sku}
                  className={
                    "border-b border-l-2 last:border-b-0 " +
                    (meins ? "border-l-accent bg-accent-soft/40" : "border-l-transparent")
                  }
                >
                  <td className="px-4 py-3 align-top">
                    <span className={meins ? "ct-label text-ink" : "ct-small text-ink"}>
                      {name(p)}
                    </span>
                    {meins && (
                      <span className="ml-2 align-middle">
                        <Badge tone="accent">{t.yours}</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {p.area_sqm != null ? (
                      <>
                        <span className="ct-small tabular-nums text-ink">
                          {p.area_sqm} {t.sqm}
                        </span>
                        {p.size_note && <span className="ct-help block">{p.size_note}</span>}
                      </>
                    ) : (
                      <span className="ct-help">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {p.components.length === 0 ? (
                      <span className="ct-help">{t.noEquip}</span>
                    ) : (
                      <ul className="ct-small flex flex-col gap-0.5">
                        {p.components.map((c) => (
                          <li key={c.sku}>
                            <span className="tabular-nums">{formatQty(c.qty, c.unit)}</span>{" "}
                            {locale === "en" ? (c.name_en ?? c.name_de) : c.name_de}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * „2 ×", „18 qm", „6 m" — die Einheit steht am Produkt, nicht im Text.
 *
 * Nachkommastellen fallen weg, wenn es keine gibt: „1,00 Tresen" liest sich
 * wie ein Tippfehler.
 */
function formatQty(qty: number, unit: string): string {
  const n = Number(qty);
  const zahl = Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
  if (unit === "sqm") return `${zahl} qm`;
  if (unit === "m") return `${zahl} m`;
  return `${zahl} ×`;
}
