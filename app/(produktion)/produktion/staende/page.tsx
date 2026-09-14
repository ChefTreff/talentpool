import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductionTabs } from "../shell";
import { BoothChecklist } from "../BoothChecklist";
import { loadAxes, loadBooths } from "../load";

export const dynamic = "force-dynamic";

export default async function BoothsPage() {
  await requireArea("produktion", "/produktion/staende");
  const { locale, t } = await getI18n("de");
  const axes = await loadAxes();

  return (
    <>
      <PageHeader title={t.production.boothTitle} description={t.production.boothLead} />
      <ProductionTabs />
      {!axes.editionId ? (
        <EmptyState title={t.production.emptyBooths} description={t.production.emptyBoothsBody} />
      ) : (
        <BoothChecklist
          items={await loadBooths(axes.editionId)}
          locale={locale}
          t={t.production}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
