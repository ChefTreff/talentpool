import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductionTabs } from "./shell";
import { AxisPicker } from "@/components/regie/AxisPicker";
import { RegieTable } from "@/components/regie/RegieTable";
import { loadAxes, loadRegie } from "./load";

export const dynamic = "force-dynamic";

/**
 * Regie-Ansicht: eine Bühne, ein Tag, der Ablauf von oben nach unten.
 * Nur `production_team`, Programm-Team oder Admin — die RPCs prüfen es selbst.
 */
export default async function ProduktionPage({
  searchParams,
}: {
  searchParams: Promise<{ buehne?: string; tag?: string }>;
}) {
  await requireArea("produktion", "/produktion");
  const { locale, t } = await getI18n("de");
  const { buehne, tag } = await searchParams;
  const axes = await loadAxes();

  const stage = axes.stages.find((s) => s.id === buehne) ?? axes.stages[0];
  // Nur Tage der Veranstaltung, zu der die Bühne gehört.
  const days = stage ? axes.days.filter((d) => d.event_id === stage.event_id) : [];
  const day = days.find((d) => d.id === tag) ?? days[0];

  if (!stage || !day) {
    return (
      <>
        <PageHeader title={t.production.title} description={t.production.lead} />
        <ProductionTabs />
        <EmptyState title={t.production.noStage} description={t.production.noStageBody} />
      </>
    );
  }

  const { cues, open } = await loadRegie(stage.id, day.id);

  return (
    <>
      <PageHeader title={t.production.title} description={t.production.lead} />
      <ProductionTabs />
      <AxisPicker
        stages={axes.stages}
        days={days}
        stageId={stage.id}
        dayId={day.id}
        locale={locale}
        labels={{ stage: t.production.stage, day: t.production.day }}
      />
      {/* Derselbe Ausdruck wie im Lead-Portal — die Produktion nimmt ihn mit
          an den Tag. */}
      <p className="mb-4 flex flex-wrap gap-4">
        <Link className="ct-link ct-small" href={`/regie/druck?buehne=${stage.id}&tag=${day.id}`} target="_blank">
          {t.leads.regiePrint}
        </Link>
        <Link className="ct-link ct-small" href={`/regie/csv?buehne=${stage.id}&tag=${day.id}`}>
          {t.leads.regieCsv}
        </Link>
      </p>
      <RegieTable
        stageId={stage.id}
        dayId={day.id}
        cues={cues}
        open={open}
        timezone="Europe/Berlin"
        locale={locale}
        t={t.production}
        rpcMessages={t.rpc}
      />
    </>
  );
}
