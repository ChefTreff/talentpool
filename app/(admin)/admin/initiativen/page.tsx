import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { InitiativenView } from "./InitiativenView";
import type { Initiative, IniProdukt } from "./types";

export const dynamic = "force-dynamic";

/**
 * Der Funnel für Initiativen.
 *
 * Initiativen laufen nicht über HubSpot: es fliesst kein Geld, es gibt keinen
 * Deal, und die Leistungen entstehen aus einer Vereinbarung. Diese Seite ist
 * deshalb der Ersatz für das, was beim Vertrieb der Deal leistet — Stand,
 * Leistungen, offene Pflichten.
 */
export default async function InitiativenPage() {
  await requireAdminSection("initiatives", "/admin/initiativen");
  const { t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const [liste, produkte] = await Promise.all([
    supabase.rpc("initiatives_admin"),
    supabase
      .from("product")
      .select("sku,name_de")
      .like("sku", "INI-%")
      .eq("active", true)
      .order("sku"),
  ]);

  if (liste.error) {
    return (
      <>
        <PageHeader title={t.adminInitiatives.title} description={t.adminInitiatives.lead} />
        <EmptyState
          title={t.adminInitiatives.noAccessTitle}
          description={t.adminInitiatives.noAccessBody}
        />
      </>
    );
  }

  const zeilen = (liste.data ?? []) as Initiative[];
  const angebot: IniProdukt[] = ((produkte.data ?? []) as { sku: string; name_de: string }[]).map(
    (p) => ({ sku: p.sku, name: p.name_de }),
  );

  return (
    <>
      <PageHeader title={t.adminInitiatives.title} description={t.adminInitiatives.lead} />
      {zeilen.length === 0 ? (
        <EmptyState title={t.adminInitiatives.emptyTitle} description={t.adminInitiatives.emptyBody} />
      ) : (
        <InitiativenView
          initiativen={zeilen}
          angebot={angebot}
          dateLocale={t.meta.dateLocale}
          t={t.adminInitiatives}
          stageLabels={t.initiativeStages}
          common={{ save: t.common.save, cancel: t.common.cancel, none: t.common.none }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
