import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadShop } from "../load";
import { Bestellungen } from "./Bestellungen";

export const dynamic = "force-dynamic";

/**
 * Bestellungen als eigene Seite (F11.4) — nach Konrads Vorbild aus dem alten
 * Portal: eine Liste mit Nummer, Datum, Stand und Summe, Einzelheiten beim
 * Aufklappen.
 *
 * Der Warenkorb ist hier nicht dabei; er hat eine eigene Seite. Beides
 * untereinander war der Grund, warum man die Historie nie gefunden hat.
 */
export default async function ShopOrdersPage() {
  const { locale, t } = await getI18n("de");
  const { orders, cart, canOrder } = await loadShop();
  const s = t.partnerShop;

  const history = orders.filter((o) => o.id !== cart?.id);

  if (history.length === 0) {
    return (
      <EmptyState
        title={s.ordersEmptyTitle}
        description={s.ordersEmptyBody}
        action={
          <Link className="ct-link" href="/partner/shop">
            {s.backToCatalogue}
          </Link>
        }
      />
    );
  }

  return (
    <Bestellungen
      orders={history}
      canOrder={canOrder}
      locale={locale}
      dateLocale={t.meta.dateLocale}
      t={s}
      common={{ cancel: t.common.cancel }}
      rpcMessages={t.rpc}
    />
  );
}
