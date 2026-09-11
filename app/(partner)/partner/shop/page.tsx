import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import {
  canEditOnboarding,
  type PartnerOverview,
  type ShopOrder,
  type ShopPhase,
  type ShopProduct,
} from "../types";
import type { MerchAsset } from "./MerchDialog";
import { ShopView } from "./ShopView";

export const dynamic = "force-dynamic";

/**
 * Messeshop: Katalog direkt, ohne Startseite (S1).
 *
 * Was bestellbar ist, entscheidet die Datenbank — `shop_catalogue` rechnet
 * Phase, Bestand und Verfügbarkeit schon ein und liefert `orderable`. Die
 * Seite zeigt das nur; jede Schreib-RPC prüft es ohnehin noch einmal.
 */
export default async function PartnerShopPage() {
  await requireArea("partner", "/partner/shop");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const args = { p_org_id: current.org_id, p_edition_id: current.edition_id };
  const [
    { data: phaseJson },
    { data: productRows },
    { data: orderRows },
    { data: overviewJson },
    { data: assetRows },
    vocab,
  ] = await Promise.all([
    supabase.rpc("shop_phase_info", args),
    supabase.rpc("shop_catalogue", args),
    supabase.rpc("shop_my_orders", args),
    supabase.rpc("partner_overview", args),
    supabase.rpc("my_partner_assets", args),
    loadVocabMap(supabase, locale),
  ]);

  const phase = (phaseJson ?? null) as ShopPhase | null;
  const products = (productRows ?? []) as ShopProduct[];
  const orders = (orderRows ?? []) as ShopOrder[];
  const overview = (overviewJson ?? null) as PartnerOverview | null;

  /**
   * Auswahl für ein Logo-Feld der Merch-Konfiguration (S4): nur die aktuelle
   * Fassung je Datei, und nichts, was die Prüfung zurückgewiesen hat.
   */
  const merchAssets: MerchAsset[] = (
    (assetRows ?? []) as {
      id: string;
      filename: string | null;
      storage_path: string;
      label_de: string | null;
      label_en: string | null;
      is_current: boolean;
      status: string;
    }[]
  )
    .filter((a) => a.is_current && a.status !== "rejected")
    .map((a) => ({
      id: a.id,
      label: [
        (locale === "en" ? a.label_en : a.label_de) ?? null,
        a.filename ?? a.storage_path.split("/").pop() ?? a.id,
      ]
        .filter(Boolean)
        .join(" · "),
    }));

  if (!phase) {
    return (
      <>
        <PageHeader title={t.partnerShop.title} description={t.partnerShop.lead} />
        <EmptyState title={t.partnerShop.emptyTitle} description={t.partnerShop.emptyBody} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.partnerShop.title} description={t.partnerShop.lead} />
      {products.length === 0 && orders.length === 0 ? (
        <EmptyState title={t.partnerShop.emptyTitle} description={t.partnerShop.emptyBody} />
      ) : (
        <ShopView
          orgId={current.org_id}
          phase={phase}
          products={products}
          orders={orders}
          categories={vgroup(vocab, "product_category")}
          merchAssets={merchAssets}
          // Bestellen dürfen dieselben Rollen wie sonst auch; `event_app_member`
          // liest nur (Entscheidung 1, es gibt keine Rolle `shop`).
          canOrder={canEditOnboarding(overview?.roles ?? [], overview?.team ?? false)}
          locale={locale}
          dateLocale={t.meta.dateLocale}
          t={t.partnerShop}
          common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
