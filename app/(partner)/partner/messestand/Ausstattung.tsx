import type { Locale } from "@/lib/i18n/shared";
import { Card } from "@/components/ui/Card";
import { meterAngabe } from "./masse";
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
 * Seit PART-085 (Konrad 25.09.) nur noch der **gebuchte** Stand — die übrigen
 * Pakete sind für den Partner irrelevant; die Seite filtert, diese Tabelle
 * zeigt. Die Größe steht als „3x3 m“.
 */
export function Ausstattung({
  packages,
  locale,
  t,
}: {
  /** Nur die gebuchten Stände dieser Organisation. */
  packages: BoothPackage[];
  locale: Locale;
  t: Strings;
}) {
  const name = (p: BoothPackage) => (locale === "en" ? (p.name_en ?? p.name_de) : p.name_de);

  return (
    <Card className="p-0">
      {/* Die Tabelle scrollt in ihrem eigenen Kasten; die Seite nie. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-160 border-collapse">
          <thead>
            <tr className="border-b">
              <th scope="col" className="ct-label px-4 py-2.5 text-left text-muted">
                {t.colPackage}
              </th>
              <th scope="col" className="ct-label w-45 px-4 py-2.5 text-left text-muted">
                {t.colSize}
              </th>
              <th scope="col" className="ct-label px-4 py-2.5 text-left text-muted">
                {t.colEquip}
              </th>
            </tr>
          </thead>
          <tbody>
            {packages.map((p) => {
              return (
                <tr key={p.sku} className="border-b last:border-b-0">
                  <td className="px-4 py-3 align-top">
                    <span className="ct-label text-ink">{name(p)}</span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {p.area_sqm != null ? (
                      <>
                        <span className="ct-small tabular-nums text-ink">
                          {p.area_sqm} {t.sqm}
                        </span>
                        {p.size_note && <span className="ct-help block">{meterAngabe(p.size_note)}</span>}
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
