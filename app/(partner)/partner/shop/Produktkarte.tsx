import Link from "next/link";
import type { Locale } from "@/lib/i18n/shared";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { money, stockHint } from "./format";
import type { ShopProduct } from "../types";

type Strings = Record<string, string>;

/**
 * Eine Kachel im Katalog. Der Titel führt auf die Produktseite — Konrad:
 * „Ich hätte gern eine Suche + jeweils eine kleine Produktseite, sodass die
 * Produkte klickbar sind."
 *
 * Der Bestand steht nur da, wenn er knapp wird. Eine Zahl an jedem Artikel
 * liest sich wie ein Lagerbericht; „Noch 3 verfügbar" liest sich wie ein
 * Hinweis und ist genau dann da, wenn er zählt.
 */
export function Produktkarte({
  product,
  locale,
  dateLocale,
  t,
  action,
}: {
  product: ShopProduct;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  /** Der Bestellknopf — als Client-Komponente von aussen hereingereicht. */
  action: React.ReactNode;
}) {
  const image = product.images?.[0];
  const name = (locale === "en" ? product.name_en : product.name_de) ?? product.sku;
  const hint = locale === "en" ? product.shop_hint_en : product.shop_hint_de;
  const description =
    (locale === "en" ? product.description_en : product.description_de) ?? product.description_de;
  const stock = stockHint(product);

  return (
    <Card as="li" className="flex flex-col">
      {image && (
        // Bilder liegen im öffentlichen Bucket; kein next/image, weil die
        // Domain je Umgebung wechselt.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.url}
          alt=""
          className="mb-3 h-32 w-full rounded-ct-sm object-cover"
          loading="lazy"
        />
      )}
      <h3 className="ct-label text-ink">
        <Link href={`/partner/shop/${encodeURIComponent(product.sku)}`} className="ct-link">
          {name}
        </Link>
      </h3>
      {description && <p className="ct-help mt-1 line-clamp-3">{description}</p>}
      {hint && <p className="ct-help mt-1 font-semibold">{hint}</p>}

      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        {product.net_price_cents != null ? (
          <>
            <span className="ct-label text-ink">{money(product.net_price_cents, dateLocale)}</span>
            <span className="ct-help">{t.plusVat}</span>
            {product.unit && (
              <span className="ct-help">/ {t[`unit_${product.unit}`] ?? product.unit}</span>
            )}
          </>
        ) : (
          <span className="ct-help">{t.priceOnRequest}</span>
        )}
      </div>

      {stock && (
        <p className="mt-1">
          {stock.kind === "sold_out" ? (
            <Badge tone="warning">{t.soldOut}</Badge>
          ) : (
            <Badge tone="accent">{t.stockLeft.replace("{n}", String(stock.n))}</Badge>
          )}
        </p>
      )}

      <div className="mt-auto pt-3">{action}</div>
    </Card>
  );
}
