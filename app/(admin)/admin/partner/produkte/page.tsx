import { loadVocabMap, vgroup } from "@/lib/vocab";
import { partnerAdminShell } from "../shell";
import type { AdminProduct, ProductComponent } from "../types";
import { ProductEditor } from "./ProductEditor";
import { ladeAbgleich } from "./abgleich";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Die drei Pass-Typen, die `upsert_product` annimmt (22023 `invalid_pass_type`). */
const PASS_TYPES = ["partner", "talent", "investor"] as const;

/** Produktstamm: Preise, Bestand, Sichtbarkeit im Shop, Bündel. */
export default async function AdminProductsPage() {
  const shell = await partnerAdminShell("/admin/partner/produkte");
  if (!shell.ok) return shell.view;
  const { supabase, t, locale, frame } = shell;

  const [{ data: rows }, { data: parts }, vocab, abgleich] = await Promise.all([
    supabase.rpc("admin_products"),
    supabase.from("product_component").select("bundle_sku,component_sku,qty"),
    loadVocabMap(supabase, locale),
    // PROD-006: Abgleich je Artikel — `partnerAdminShell` hat den Abschnitt `partner` geprüft.
    ladeAbgleich(createSupabaseAdminClient()),
  ]);

  const products = (rows ?? []) as AdminProduct[];

  return frame(
    t.adminPartner.productsTitle,
    `${t.adminPartner.productsLead} · ${products.length}`,
    <ProductEditor
      products={products}
      components={(parts ?? []) as ProductComponent[]}
      categories={vgroup(vocab, "product_category")}
      formats={vgroup(vocab, "partner_format")}
      levels={vgroup(vocab, "sponsoring_level")}
      roles={vgroup(vocab, "role")}
      passTypes={PASS_TYPES}
      dateLocale={t.meta.dateLocale}
      t={t.adminPartner}
      common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
      rpcMessages={t.rpc}
      abgleich={abgleich}
    />,
  );
}
