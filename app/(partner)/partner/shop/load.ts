import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { getPartnerScope } from "../org";
import {
  canEditOnboarding,
  cartOf,
  type PartnerOverview,
  type ShopOrder,
  type ShopPhase,
  type ShopProduct,
} from "../types";
import type { MerchAsset } from "./MerchDialog";

/**
 * Alles, was die vier Shop-Seiten brauchen — **einmal** geladen.
 *
 * Der Shop ist seit F11 kein einzelner Bildschirm mehr, sondern Katalog,
 * Produktseite, Warenkorb und Bestellungen. Jede davon braucht Phase, Katalog
 * und Warenkorb; ohne `cache()` liefe dieselbe Abfrage im Layout und in der
 * Seite zweimal.
 */
export type ShopData = {
  orgId: string;
  editionId: string;
  phase: ShopPhase | null;
  products: ShopProduct[];
  orders: ShopOrder[];
  cart: ShopOrder | null;
  overview: PartnerOverview | null;
  categories: Record<string, string>;
  merchAssets: MerchAsset[];
  canOrder: boolean;
};

export const loadShop = cache(async (): Promise<ShopData> => {
  const { locale } = await getI18n("de");
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

  return {
    orgId: current.org_id,
    editionId: current.edition_id,
    phase: (phaseJson ?? null) as ShopPhase | null,
    products: (productRows ?? []) as ShopProduct[],
    orders,
    cart: cartOf(orders),
    overview,
    categories: vgroup(vocab, "product_category"),
    merchAssets,
    // Bestellen dürfen dieselben Rollen wie sonst auch; `event_app_member`
    // liest nur (Entscheidung 1, es gibt keine Rolle `shop`).
    canOrder: canEditOnboarding(overview?.roles ?? [], overview?.team ?? false),
  };
});
