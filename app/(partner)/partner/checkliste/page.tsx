import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../org";
import { canEditOnboarding, type Deliverable, type PartnerOverview } from "../types";
import { ChecklistView, type ChecklistGroup } from "./ChecklistView";

export const dynamic = "force-dynamic";

/**
 * Die Checkliste entsteht ausschließlich aus gebuchten Leistungen — die
 * Trigger hinter `org_product` legen sie an, `my_deliverables` gibt sie
 * heraus. Diese Seite gruppiert und zeigt, sie erfindet nichts dazu.
 */
export default async function PartnerChecklistPage() {
  await requireArea("partner", "/partner/checkliste");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, { data: overviewJson }] = await Promise.all([
    supabase.rpc("my_deliverables", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
    supabase.rpc("partner_overview", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
  ]);
  const deliverables = (rows ?? []) as Deliverable[];
  const overview = (overviewJson ?? null) as PartnerOverview | null;
  if (!overview) notFound();

  // Gruppierung nach Leistung; was an keiner hängt, steht unter „Für alle".
  const groups: ChecklistGroup[] = [];
  const bySku = new Map<string | null, ChecklistGroup>();
  for (const d of [...deliverables].sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key))) {
    const sku = d.product_sku;
    let group = bySku.get(sku);
    if (!group) {
      group = {
        sku,
        label:
          sku === null
            ? t.partnerChecklist.groupGlobal
            : ((locale === "en" ? d.product_name_en : d.product_name_de) ??
              d.product_name_de ??
              sku),
        items: [],
      };
      bySku.set(sku, group);
      groups.push(group);
    }
    group.items.push(d);
  }
  // „Für alle" zuerst, danach die Leistungen in ihrer Reihenfolge.
  groups.sort((a, b) => (a.sku === null ? -1 : b.sku === null ? 1 : 0));

  const c = overview.checklist;

  return (
    <>
      <PageHeader
        title={t.partnerChecklist.title}
        description={`${t.partnerChecklist.lead} · ${t.partner.checklistDone
          .replace("{done}", String(c.done))
          .replace("{total}", String(c.total))}`}
      />
      {deliverables.length === 0 ? (
        <EmptyState
          title={t.partnerChecklist.emptyTitle}
          description={t.partnerChecklist.emptyBody}
        />
      ) : (
        <ChecklistView
          orgId={current.org_id}
          editionId={current.edition_id}
          groups={groups}
          booth={overview.booth}
          // Hochladen und einreichen dürfen dieselben Rollen wie die
          // Stammdatenpflege; die RPC prüft es noch einmal.
          canEdit={canEditOnboarding(overview.roles, overview.team)}
          locale={locale}
          dateLocale={t.meta.dateLocale}
          t={t.partnerChecklist}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
