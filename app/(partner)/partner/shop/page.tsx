import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { AddToCart } from "./AddToCart";
import { Produktkarte } from "./Produktkarte";
import { loadShop } from "./load";

export const dynamic = "force-dynamic";

/**
 * Der Katalog. Suche und Kategorie stehen in der Adresse, gefiltert wird
 * **serverseitig** — so zeigt ein geteilter Link dasselbe, und der Zurück-Knopf
 * führt aus einer Produktseite in die Trefferliste zurück.
 *
 * Das war vorher anders und hat mich im F4-Abgleich eine falsche Meldung
 * gekostet: die Kategorie lag im Zustand der Komponente, ein serverseitiger
 * Abruf sah nur die erste.
 */
export default async function ShopCataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kat?: string }>;
}) {
  const { locale, t } = await getI18n("de");
  const { q, kat } = await searchParams;
  const { orgId, products, cart, categories, merchAssets, canOrder, hasBooth } = await loadShop();
  const s = t.partnerShop;

  // Ohne Stand kein Katalog (PART-037). Die Datenbank liefert dann ohnehin
  // nichts; hier steht, warum — und wo das Lunch-Paket trotzdem zu finden ist,
  // denn das darf jeder Partner bestellen (PART-049).
  if (!hasBooth) {
    return (
      <EmptyState
        title={s.noBoothTitle}
        description={`${s.noBoothBody} ${s.noBoothLunch}`}
        action={
          <Link href="/partner/checkliste" className="ct-link">
            {s.noBoothAction}
          </Link>
        }
      />
    );
  }

  const inCart = new Map((cart?.lines ?? []).map((l) => [l.sku, l.qty]));

  const begriff = (q ?? "").trim().toLocaleLowerCase(locale);
  const passt = (text: string | null | undefined) =>
    (text ?? "").toLocaleLowerCase(locale).includes(begriff);

  // Gesucht wird über Name, Beschreibung, Hinweis und SKU — wer die Artikelnummer
  // aus einem Angebot abtippt, soll sie auch finden.
  const gefunden = begriff
    ? products.filter(
        (p) =>
          passt(p.name_de) ||
          passt(p.name_en) ||
          passt(p.description_de) ||
          passt(p.description_en) ||
          passt(p.shop_hint_de) ||
          passt(p.shop_hint_en) ||
          p.sku.toLocaleLowerCase(locale).includes(begriff),
      )
    : products;

  const tabs = [...new Set(gefunden.map((p) => p.category ?? "").filter(Boolean))].sort((a, b) =>
    (categories[a] ?? a).localeCompare(categories[b] ?? b, locale),
  );
  // Bei einer Suche zeigen wir alle Treffer über die Kategorien hinweg — wer
  // sucht, will finden und nicht erst den richtigen Reiter raten.
  const aktiv = begriff ? null : (kat && tabs.includes(kat) ? kat : (tabs[0] ?? null));
  const gezeigt = aktiv === null ? gefunden : gefunden.filter((p) => (p.category ?? "") === aktiv);

  const linkTo = (key: string | null) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (key) params.set("kat", key);
    const query = params.toString();
    return `/partner/shop${query ? `?${query}` : ""}`;
  };

  if (products.length === 0) {
    return <EmptyState title={s.emptyTitle} description={s.emptyBody} />;
  }

  return (
    <section aria-labelledby="h-catalogue">
      <div className="mb-3 flex flex-wrap items-baseline gap-2 border-b pb-2">
        <h2 id="h-catalogue" className="ct-h3 text-ink">
          {begriff ? s.searchResults : s.catalogue}
        </h2>
        <span className="ct-help ml-auto tabular-nums">{gezeigt.length}</span>
      </div>

      {!begriff && tabs.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1" aria-label={s.categories}>
          {tabs.map((key) => (
            <Link
              key={key}
              href={linkTo(key)}
              aria-current={key === aktiv ? "page" : undefined}
              className={cn(
                "rounded-ct-sm px-2.5 py-1.5 ct-label transition-colors",
                key === aktiv
                  ? "bg-accent-soft text-accent-deep"
                  : "text-muted hover:bg-surface-hover hover:text-ink",
              )}
            >
              {categories[key] ?? key}
            </Link>
          ))}
        </div>
      )}

      {gezeigt.length === 0 ? (
        <EmptyState
          title={s.noHitsTitle}
          description={s.noHitsBody.replace("{q}", q ?? "")}
          action={
            <Link className="ct-link" href="/partner/shop">
              {s.clearSearch}
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {gezeigt.map((p) => (
            <Produktkarte
              key={p.sku}
              product={p}
              locale={locale}
              dateLocale={t.meta.dateLocale}
              t={s}
              action={
                <AddToCart
                  orgId={orgId}
                  product={p}
                  inCart={inCart.get(p.sku) ?? null}
                  canOrder={canOrder}
                  merchAssets={merchAssets}
                  locale={locale}
                  t={s}
                  common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
                  rpcMessages={t.rpc}
                />
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}
