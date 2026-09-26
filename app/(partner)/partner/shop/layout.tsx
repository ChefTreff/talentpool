import type { ReactNode } from "react";
import { Suspense } from "react";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { loadVideo, loomEmbedUrl } from "@/components/video/load";
import { PhaseBanner } from "./PhaseBanner";
import { ShopBar } from "./ShopBar";
import { ShopEinstieg } from "./ShopEinstieg";
import { loadShop } from "./load";
import { cartCount } from "./format";

export const dynamic = "force-dynamic";

/**
 * Die Hülle des Shops: Überschrift, Phasenhinweis, Suche und Warenkorb.
 *
 * Seit F11 ist der Shop kein einzelner Bildschirm mehr — Katalog, Produkt,
 * Warenkorb und Bestellungen sind eigene Seiten. Was auf allen gleich ist,
 * steht hier; sonst müsste jede Seite es wiederholen und eine davon wäre
 * irgendwann anders. Dazu gehört seit PART-039 der Einstieg mit dem
 * Erklärvideo (Schlüssel `partner_shop`) und „Anleitung & Support“ unten.
 */
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await getI18n("de");
  const { orgId, editionId, phase, cart } = await loadShop();
  const video = await loadVideo("partner_shop", "partner", editionId);
  const s = t.partnerShop;

  return (
    <>
      <PageHeader word={t.partner.wordEquipment} title={s.title} description={s.lead} />
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
      {phase && (
        <PhaseBanner
          phase={phase}
          dateLocale={t.meta.dateLocale}
          t={s}
          countdown={{
            days: t.partnerTickets.countdownDays,
            hours: t.partnerTickets.countdownHours,
            soon: t.partnerTickets.countdownSoon,
            unitDays: t.partnerTickets.unitDays,
            unitHours: t.partnerTickets.unitHours,
            unitHour: t.partnerTickets.unitHour,
          }}
        />
      )}
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
      <ShopEinstieg
        schluessel={`${orgId}.${editionId}`}
        video={
          video
            ? {
                src: loomEmbedUrl(video.url),
                title: (locale === "en" ? video.title_en : video.title_de) ?? s.guideVideoTitle,
              }
            : null
        }
        wikiHref="/partner/wiki"
        t={{
          guideTitle: s.guideTitle,
          guideBody: s.guideBody,
          guideVideo: s.guideVideo,
          guideWiki: s.guideWiki,
          introTitle: s.introTitle,
          introBody: s.introBody,
          introStart: s.introStart,
          close: t.common.close,
        }}
        embed={{ loadLabel: t.common.loadVideo, notice: t.common.embedNotice, openLabel: t.common.openAtProvider }}
      />
    </>
  );
}
