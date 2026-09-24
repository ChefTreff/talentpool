import "server-only";
import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { AxisPicker } from "./AxisPicker";
import { RegieTable } from "./RegieTable";
import { loadRegieAxes, loadRegieCues } from "./load";
import { neuesFenster } from "@/components/ui/neues-fenster";

/**
 * Die Regie-Tabelle als **eine** Seite für zwei Wege.
 *
 * Die Anweisungen entstehen bei der Person, die die Bühne programmiert
 * (Lead-Portal), und werden am Veranstaltungstag von der Produktion benutzt.
 * Seit der Regel „Admin-Vollständigkeit" (22.09.) hängt dieselbe Seite auch
 * unter `/admin/regie` — Konrad arbeitet ausschliesslich dort.
 *
 * **Keine zweite Logik.** Welche Bühnen jemand sieht, entscheidet
 * `my_regie_stages()` über `can_edit_regie()`; ein Admin ist dort über
 * `can_edit_stage()` drin und sieht deshalb alle, eine Stage Lead nur ihre.
 * Die Seite filtert nichts nach.
 */
export async function RegieSeite({ buehne, tag }: { buehne?: string; tag?: string }) {
  const { locale, t } = await getI18n("de");
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
        <Link className="ct-link ct-small" href={`/regie/druck${query}`} {...neuesFenster}>
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
