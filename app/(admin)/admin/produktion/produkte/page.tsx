import { requireAdminSection } from "@/lib/auth";
import { mayEnterAdminSection } from "@/lib/admin-access";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductEditor } from "../../partner/produkte/ProductEditor";
import { ladeAbgleich } from "../../partner/produkte/abgleich";
import type { AdminProduct, ProductComponent } from "../../partner/types";
import { saveProduct, saveProductComponent } from "./actions";

export const dynamic = "force-dynamic";

const PASS_TYPES = ["partner", "talent", "investor"] as const;

/**
 * Produktstamm pflegen aus der Produktion (PROD-006, Konrad 17./25.09.):
 * Artikel anlegen und ändern mit allen Feldern, Bild, Phase (kurzfristig
 * bestellbar, bestellbar bis), Sichtbarkeit im Shop. Derselbe Editor wie
 * unter Partner → Produkte, mit eigenem Gate (`productCatalog`). Der Abgleich
 * nach HubSpot/SevDesk erscheint je Artikel nur, wer auch den Abschnitt
 * `partner` öffnen darf — die Abgleich-Route prüft genau den.
 */
export default async function ProduktstammPage() {
  const ctx = await requireAdminSection("productCatalog", "/admin/produktion/produkte");
  const { t, locale } = await getI18n("de");
  const supabase = await createSupabaseServerClient();
  const [{ data: rows, error }, vocab, darfAbgleich] = await Promise.all([
    supabase.rpc("admin_products"),
    loadVocabMap(supabase, locale),
    mayEnterAdminSection("partner", ctx.roleNames),
  ]);
  // `product_component` liest nur das Partner-Team über RLS — die Service-Rolle erst nach dem Gate oben.
  const admin = createSupabaseAdminClient();
  const [{ data: parts }, abgleich] = await Promise.all([
    admin.from("product_component").select("bundle_sku,component_sku,qty"),
    darfAbgleich ? ladeAbgleich(admin) : Promise.resolve(null),
  ]);
  const products = (rows ?? []) as AdminProduct[];

  return (
    <>
      <PageHeader word={t.admin.words.productCatalog} title={t.adminPartner.catalogTitle} description={t.adminPartner.catalogLead} />
      {error ? (
        <EmptyState title={t.adminPartner.catalogErrorTitle} description={t.adminPartner.catalogErrorBody} />
      ) : (
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
          speichern={saveProduct}
          bestandteil={saveProductComponent}
          abgleich={abgleich}
        />
      )}
    </>
  );
}
