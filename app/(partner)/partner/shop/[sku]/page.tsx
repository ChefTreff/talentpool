import Link from "next/link";
import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { AddToCart } from "../AddToCart";
import { loadShop } from "../load";
import { stockHint } from "../format";
import { money } from "../format";

export const dynamic = "force-dynamic";

/**
 * Eine Seite je Artikel (F11.3).
 *
 * Sie zeigt, was auf der Kachel nicht hinpasst: das ganze Bild, die volle
 * Beschreibung, Einheit, Verfügbarkeit. Und sie hat einen **Zurück-Weg**, der
 * die Suche mitnimmt — sonst landet man nach jedem Blick auf ein Produkt
 * wieder am Anfang des Katalogs.
 */
export default async function ShopProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<{ q?: string; kat?: string }>;
}) {
  const { locale, t } = await getI18n("de");
  const { sku } = await params;
  const { q, kat } = await searchParams;
  const { orgId, products, cart, categories, merchAssets, canOrder } = await loadShop();

  const product = products.find((p) => p.sku === decodeURIComponent(sku));
  if (!product) notFound();

  // Als Wörterbuch weitergereicht: die Einheiten stehen unter `unit_<key>`,
  // und ein getippter Schlüssel liesse sich nicht indizieren.
  const s: Record<string, string> = t.partnerShop;
  const dateTime = new Intl.DateTimeFormat(t.meta.dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const name = (locale === "en" ? product.name_en : product.name_de) ?? product.sku;
  const description =
    (locale === "en" ? product.description_en : product.description_de) ?? product.description_de;
  const hint = locale === "en" ? product.shop_hint_en : product.shop_hint_de;
  const image = product.images?.[0];
  const stock = stockHint(product);
  const inCart = (cart?.lines ?? []).find((l) => l.sku === product.sku)?.qty ?? null;

  // Der Zurück-Weg trägt Suche und Kategorie — genau die Liste, aus der man kam.
  const back = new URLSearchParams();
  if (q) back.set("q", q);
  if (kat) back.set("kat", kat);
  const backQuery = back.toString();

  return (
    <div className="flex flex-col gap-4">
      <p>
        <Link className="ct-link ct-small" href={`/partner/shop${backQuery ? `?${backQuery}` : ""}`}>
          ← {s.backToCatalogue}
        </Link>
      </p>

      <Card>
        <div className="flex flex-col gap-6 sm:flex-row">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.url}
              alt=""
              className="w-full rounded-ct-sm object-cover sm:w-70"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="ct-eyebrow text-muted">
              {categories[product.category ?? ""] ?? product.category ?? s.catalogue}
            </p>
            <h2 className="ct-h2 mt-1 text-ink">{name}</h2>

            <div className="mt-3 flex flex-wrap items-baseline gap-2">
              {product.net_price_cents != null ? (
                <>
                  <span className="ct-h3 text-ink">
                    {money(product.net_price_cents, t.meta.dateLocale)}
                  </span>
                  <span className="ct-help">{s.plusVat}</span>
                  {product.unit && (
                    <span className="ct-help">/ {s[`unit_${product.unit}`] ?? product.unit}</span>
                  )}
                </>
              ) : (
                <span className="ct-help">{s.priceOnRequest}</span>
              )}
            </div>

            {stock && (
              <p className="mt-2">
                {stock.kind === "sold_out" ? (
                  <Badge tone="warning">{s.soldOut}</Badge>
                ) : (
                  <Badge tone="accent">{s.stockLeft.replace("{n}", String(stock.n))}</Badge>
                )}
              </p>
            )}

            {description && <p className="ct-small mt-4 leading-6 whitespace-pre-line">{description}</p>}
            {hint && <p className="ct-small mt-3 leading-6 font-semibold">{hint}</p>}
            {product.available_until && (
              <p className="ct-help mt-3">
                {s.availableUntil} {dateTime.format(new Date(product.available_until))}
              </p>
            )}
            <p className="ct-help mt-3 tabular-nums">{product.sku}</p>

            <div className="mt-5">
              <AddToCart
                orgId={orgId}
                product={product}
                inCart={inCart}
                canOrder={canOrder}
                merchAssets={merchAssets}
                locale={locale}
                size="md"
                t={s}
                common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
                rpcMessages={t.rpc}
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
