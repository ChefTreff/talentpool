import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { AxisPicker } from "@/components/regie/AxisPicker";
import { RegieTable } from "@/components/regie/RegieTable";
import { loadRegieAxes, loadRegieCues } from "@/components/regie/load";

export const dynamic = "force-dynamic";

const PATH = "/speaker-leads/regie";

/**
 * Regie im Lead-Portal (Konrad, 15.09.).
 *
 * Die Anweisungen **entstehen hier** — bei der Person, die die Bühne
 * programmiert — und werden von der Produktion am Veranstaltungstag benutzt.
 * Deshalb dieselbe Tabelle wie in der Produktion, nur mit den Bühnen, für die
 * diese Person zuständig ist (`my_regie_stages`, Migration 0101).
 */
export default async function LeadsRegiePage({
  searchParams,
}: {
  searchParams: Promise<{ buehne?: string; tag?: string }>;
}) {
  await requireArea("speaker-leads", PATH);
  const { locale, t } = await getI18n("de");
  const { buehne, tag } = await searchParams;
  const { stages, days: alleTage } = await loadRegieAxes();

  const stage = stages.find((s) => s.stage_id === buehne) ?? stages[0];
  const days = stage ? alleTage.filter((d) => d.event_id === stage.event_id) : [];
  const day = days.find((d) => d.id === tag) ?? days[0];

  if (!stage || !day) {
    return (
      <>
        <PageHeader title={t.production.title} description={t.leads.regieLead} />
        <EmptyState title={t.leads.regieEmptyTitle} description={t.leads.regieEmptyBody} />
      </>
    );
  }

  const { cues, open } = await loadRegieCues(stage.stage_id, day.id);
  const query = `?buehne=${stage.stage_id}&tag=${day.id}`;

  return (
    <>
      <PageHeader title={t.production.title} description={t.leads.regieLead} />
      <AxisPicker
        stages={stages.map((s) => ({ id: s.stage_id, name: s.stage_name, event_id: s.event_id }))}
        days={days}
        stageId={stage.stage_id}
        dayId={day.id}
        locale={locale}
        labels={{ stage: t.production.stage, day: t.production.day }}
      />
      {/* Der Ausdruck ist das Ziel der Übung: Techniker und Stage Hands
          bekommen ihn auf Papier, nicht als Link. */}
      <p className="mb-4 flex flex-wrap gap-4">
        <Link className="ct-link ct-small" href={`/regie/druck${query}`} target="_blank">
          {t.leads.regiePrint}
        </Link>
        <Link className="ct-link ct-small" href={`/regie/csv${query}`}>
          {t.leads.regieCsv}
        </Link>
      </p>
      <RegieTable
        stageId={stage.stage_id}
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
