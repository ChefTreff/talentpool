import { EmptyState } from "@/components/ui/EmptyState";
import { parseMerchSchema, type MerchField } from "@/lib/partner/merch";
import { EditionPicker } from "../EditionPicker";
import { loadEditions, pickEdition } from "../editions";
import { partnerAdminShell } from "../shell";
import type { AdminOrder, AdminProduct, AdminRequest, ShopReportRow } from "../types";
import { OrdersView } from "./OrdersView";

export const dynamic = "force-dynamic";

/** Bestellungen, Anfragen, Auswertung und der Rechnungslauf — je Edition. */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ edition?: string }>;
}) {
  const shell = await partnerAdminShell("/admin/partner/bestellungen");
  if (!shell.ok) return shell.view;
  const { supabase, t, frame } = shell;

  const { edition } = await searchParams;
  const editions = await loadEditions(supabase);
  const current = pickEdition(editions, edition);

  if (!current) {
    return frame(
      t.adminPartner.ordersTitle,
      t.adminPartner.ordersLead,
      <EmptyState
        title={t.adminPartner.noEditionTitle}
        description={t.adminPartner.noEditionBody}
      />,
    );
  }

  const [{ data: orders }, { data: requests }, { data: report }, { data: products }] =
    await Promise.all([
      supabase.rpc("shop_orders_admin", { p_edition_id: current.id }),
      supabase.rpc("shop_requests_admin", { p_edition_id: current.id }),
      supabase.rpc("shop_report", { p_edition_id: current.id }),
      supabase.rpc("admin_products"),
    ]);

  // Nur die Merch-Artikel: ohne Schema gibt es an einer Zeile nichts anzuzeigen.
  const merchSchemas: Record<string, MerchField[]> = {};
  for (const p of (products ?? []) as AdminProduct[]) {
    const fields = parseMerchSchema(p.merch_config);
    if (fields) merchSchemas[p.sku] = fields;
  }

  return frame(
    t.adminPartner.ordersTitle,
    t.adminPartner.ordersLead,
    <div className="flex flex-col gap-6">
      <EditionPicker
        editions={editions}
        current={current.id}
        label={t.adminPartner.editionLabel}
      />
      <OrdersView
        editionId={current.id}
        orders={(orders ?? []) as AdminOrder[]}
        requests={(requests ?? []) as AdminRequest[]}
        report={(report ?? []) as ShopReportRow[]}
        merchSchemas={merchSchemas}
        dateLocale={t.meta.dateLocale}
        t={t.adminPartner}
        common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
        rpcMessages={t.rpc}
      />
    </div>,
  );
}
