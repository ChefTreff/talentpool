import { herkunft } from "@/lib/produktion/staende";
import type { BoothItem } from "./types";

type Strings = Record<string, string>;

/**
 * Woher eine Menge stammt: Paketausstattung, Angebot, Messeshop (PROD-004).
 * „Shop 4 (4 offen)“ — der Klammerteil ist der Anteil, der noch nicht
 * abgeschlossen ist und sich bis zur Frist ändern kann. Ohne Hooks, damit
 * Server- und Client-Seiten ihn gleich nutzen.
 */
export function Herkunft({
  q,
  t,
  locale,
}: {
  q: Pick<BoothItem, "qty_package" | "qty_offer" | "qty_shop" | "qty_shop_open">;
  t: Strings;
  locale: string;
}) {
  const teile = herkunft(q);
  if (teile.length === 0) return <span className="ct-help">—</span>;
  const zahl = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const text = {
    package: t.srcPackage,
    offer: t.srcOffer,
    shop: t.srcShop,
  } as const;
  return (
    <span className="ct-help">
      {teile.map((x, i) => (
        <span key={x.art}>
          {i > 0 && " · "}
          {/* Umbrochen wird nur zwischen den Teilen, nie mitten in „Shop 4 (4 offen)“. */}
          <span className="whitespace-nowrap">
            {text[x.art].replace("{n}", zahl.format(x.menge))}
            {x.art === "shop" && x.offen > 0 && ` (${t.srcShopOpen.replace("{n}", zahl.format(x.offen))})`}
          </span>
        </span>
      ))}
    </span>
  );
}
