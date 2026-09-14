import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadShop } from "../load";
import { Warenkorb } from "./Warenkorb";

export const dynamic = "force-dynamic";

/**
 * Der Warenkorb als eigene Seite (F11.1) — dort, wo der Knopf oben rechts
 * hinführt.
 *
 * Vorher stand er unter dem Katalog, und man musste an allen Kacheln
 * vorbeiscrollen, um zu sehen, was drin liegt.
 */
export default async function WarenkorbPage() {
  const { locale, t } = await getI18n("de");
  const { orgId, phase, products, cart, overview, merchAssets, canOrder } = await loadShop();
  const s = t.partnerShop;

  if (!cart || cart.lines.length === 0) {
    return (
      <EmptyState
        title={s.cartEmptyTitle}
        description={s.cartEmptyBody}
        action={
          <Link className="ct-link" href="/partner/shop">
            {s.backToCatalogue}
          </Link>
        }
      />
    );
  }

  return (
    <Warenkorb
      orgId={orgId}
      cart={cart}
      products={products}
      overview={overview}
      closed={phase?.phase === 0}
      canOrder={canOrder}
      merchAssets={merchAssets}
      locale={locale}
      dateLocale={t.meta.dateLocale}
      t={s}
      common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
      rpcMessages={t.rpc}
    />
  );
}
