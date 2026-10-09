import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { angebotModus, angebotVerfuegbar, type Verfuegbarkeit } from "@/lib/sevdesk/angebot";
import { hasSevdeskToken } from "@/lib/sevdesk/client";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { getPartnerScope } from "../org";
import {
  canEditOnboarding,
  cartOf,
  type PartnerOverview,
  type ShopOrder,
  type ShopPhase,
  type ShopProduct,
  type ShopQuoteInfo,
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
  /**
   * Hat diese Organisation einen Messestand? Der Shop gehört zum Stand
   * (PART-037). Die Sperre selbst sitzt in den RPCs (Migration 0112) — hier
   * wird nur entschieden, ob die Seite den Katalog oder eine Erklärung zeigt.
   */
  hasBooth: boolean;
  /**
   * `shop_quote_info` des Warenkorbs (PART-116) — `null`, solange es für ihn nie ein
   * Angebot gab. Aus `quotes_used` folgt auch, ob das Limit von drei Angeboten je
   * Bestellung erreicht ist.
   */
  quote: ShopQuoteInfo | null;
  /** Das Angebot ist verfallen, die Bereinigung hat den Warenkorb aber noch nicht freigegeben. Auf dem Server gerechnet: die Oberfläche braucht keine Uhr. */
  quoteExpired: boolean;
  /**
   * Darf dieser Warenkorb ein Angebot anlegen — und wenn nicht, warum nicht. Dieselben
   * Regeln wie `shop_quote_begin`; die Datenbank entscheidet am Ende trotzdem selbst.
   */
  angebot: Verfuegbarkeit;
};

/** Mehr als drei Angebote gibt es je Bestellung nicht (`shop_quote_begin`); die Oberfläche blendet den Knopf danach aus statt ihn abweisen zu lassen. */
export const ANGEBOTE_JE_BESTELLUNG = 3;

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
  const cart = cartOf(orders);

  // Das Angebot gehört zum Warenkorb; für alle anderen Bestellungen braucht es keine Abfrage.
  // `null` heißt „nie ein Angebot“ — oder die Funktion lehnt ab, dann gilt dasselbe.
  const { data: quoteJson } = cart
    ? await supabase.rpc("shop_quote_info", { p_order_id: cart.id })
    : { data: null };
  const quote = (quoteJson ?? null) as ShopQuoteInfo | null;
  const quoteExpired =
    quote?.active === true && quote.valid_until != null && new Date(quote.valid_until).getTime() < Date.now();
  const org = overview?.org;
  const angebot = angebotVerfuegbar({
    modus: angebotModus(process.env.SHOP_ANGEBOT_SEVDESK),
    hatToken: hasSevdeskToken(),
    kundennummer: org?.customer_number,
    land: org?.address.country,
    strasse: org?.address.street,
    plz: org?.address.zip,
    ort: org?.address.city,
  });

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
    cart,
    overview,
    categories: vgroup(vocab, "product_category"),
    merchAssets,
    // Bestellen dürfen dieselben Rollen wie sonst auch; `event_app_member`
    // liest nur (Entscheidung 1, es gibt keine Rolle `shop`).
    canOrder: canEditOnboarding(overview?.roles ?? [], overview?.team ?? false),
    // Dieselbe Regel wie `org_has_booth` in der Datenbank: Standfläche oder
    // Standbühne als gebuchtes Produkt, oder ein vom Team zugewiesener Stand.
    hasBooth:
      overview?.booth != null ||
      (overview?.products ?? []).some(
        (p) => p.format_key === "booth" || p.format_key === "stage",
      ),
    quote,
    quoteExpired,
    angebot,
  };
});
