import type { ReactNode } from "react";
import { Suspense } from "react";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { PhaseBanner } from "./PhaseBanner";
import { ShopBar } from "./ShopBar";
import { loadShop } from "./load";
import { cartCount } from "./format";

export const dynamic = "force-dynamic";

/**
 * Die Hülle des Shops: Überschrift, Phasenhinweis, Suche und Warenkorb.
 *
 * Seit F11 ist der Shop kein einzelner Bildschirm mehr — Katalog, Produkt,
 * Warenkorb und Bestellungen sind eigene Seiten. Was auf allen gleich ist,
 * steht hier; sonst müsste jede Seite es wiederholen und eine davon wäre
 * irgendwann anders.
 */
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const { t } = await getI18n("de");
  const { phase, cart } = await loadShop();
  const s = t.partnerShop;

  return (
    <>
      <PageHeader title={s.title} description={s.lead} />
      {/* Die Bestellungen gehören in den Shop, nicht ins Portalmenü — sie
          sind der zweite Blick auf dieselbe Sache (Konrad, 14.09.). Der
          Warenkorb steht bewusst **nicht** als dritter Reiter daneben: er ist
          der Knopf oben rechts, wie in jedem Shop, und zwei Wege zur selben
          Seite nebeneinander sind einer zu viel. */}
      <SectionTabs
        label={s.title}
        items={[
          // `exact` plus Muster: die Produktseite markiert den Katalog-Reiter.
          { href: "/partner/shop", label: s.catalogue, exact: true, detailPattern: "^/partner/shop/I-" },
          { href: "/partner/shop/bestellungen", label: s.navOrders },
        ]}
      />
      {phase && <PhaseBanner phase={phase} dateLocale={t.meta.dateLocale} t={s} />}
      {/* `useSearchParams` braucht eine Grenze, sonst wird die ganze Seite
          statisch verweigert. */}
      <Suspense fallback={null}>
        <ShopBar
          count={cartCount(cart)}
          searchLabel={s.search}
          searchPlaceholder={s.searchPlaceholder}
          cartLabel={s.cart}
        />
      </Suspense>
      {children}
    </>
  );
}
