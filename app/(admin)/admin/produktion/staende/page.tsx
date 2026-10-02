import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { BoothChecklist } from "../BoothChecklist";
import { loadAxes, loadBoothSummary, loadBooths } from "../load";

export const dynamic = "force-dynamic";

/**
 * Produktionsliste je Stand (PROD-004) mit interner Prüfung (PROD-005).
 * Positionen und Zusammenfassung kommen aus der Datenbank
 * (`booth_checklist`, `booth_production_summary`); beide prüfen den Abschnitt
 * `productionBooths` selbst, das Gate davor sortiert nur vor.
 */
export default async function BoothsPage() {
  await requireAdminSection("productionBooths", "/admin/produktion/staende");
  const { locale, t } = await getI18n("de");
  const axes = await loadAxes();

  return (
    <>
      <PageHeader word={t.admin.words.production} title={t.production.boothTitle} description={t.production.boothLead} />
      {!axes.editionId ? (
        <EmptyState title={t.production.emptyBooths} description={t.production.emptyBoothsBody} />
      ) : (
        <BoothChecklist
          items={await loadBooths(axes.editionId)}
          stands={await loadBoothSummary(axes.editionId)}
          locale={locale}
          t={{ ...t.production, cancel: t.common.cancel }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
