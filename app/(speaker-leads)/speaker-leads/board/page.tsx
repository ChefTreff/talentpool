import { notFound } from "next/navigation";
import { requireAnyArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Board } from "@/components/programme/Board";
import { loadBoard } from "@/components/programme/load";
import { TableTabs } from "@/components/programme/TableTabs";
import { canPublishSessions } from "@/components/programme/permissions";
import type { ManagerScope } from "../types";

export const dynamic = "force-dynamic";

const PATH = "/speaker-leads/board";

/**
 * Dasselbe Board wie im Admin-Bereich, nur mit dem Blick eines Leads: die
 * eigene Edition ist vorausgewählt, fremde Editionen tauchen gar nicht erst
 * auf. Was er ändern darf, entscheidet weiterhin die Datenbank — `can_edit`
 * kommt je Zeile aus `programme_board`, und die RPCs prüfen es noch einmal.
 * Bühnen außerhalb des Scopes sind deshalb sichtbar, aber nicht ziehbar.
 */
export default async function LeadBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; tag?: string }>;
}) {
  const { roleNames } = await requireAnyArea(["admin", "speaker-leads"], PATH);
  const { t } = await getI18n("de");
  const { event, tag } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: scopeJson } = await supabase.rpc("my_manager_scope");
  const scope = (scopeJson ?? null) as ManagerScope | null;
  if (!scope?.is_manager) notFound();

  // `all` heißt Team oder globaler Manager: keine Vorauswahl, alles anbieten.
  const editionIds = scope.all
    ? []
    : [...new Set(scope.editions.map((e) => e.id))];

  const board = await loadBoard({
    eventSlug: event,
    day: tag,
    fallbackLocale: "de",
    editionIds,
  });

  if (!board.currentEvent) {
    return (
      <>
        <PageHeader word={t.leads.wordProgramme} title={t.leads.boardTitle} description={t.leads.boardLead} />
        <TableTabs basePath={PATH} locale="de" />
        <EmptyState
          title={t.admin.programme.noEventTitle}
          description={t.admin.programme.noEventBody}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader word={t.leads.wordProgramme} title={t.leads.boardTitle} description={t.leads.boardLead} />
      <TableTabs basePath={PATH} locale="de" />
      <Board
        basePath={PATH}
        canPublish={canPublishSessions(roleNames)}
        // Bearbeitbar ist die **eigene** Bühne (LEAD-016) — die, auf der der
        // Lead `speaker_manager` mit Stage-Scope ist; genau dort lässt ihn
        // `can_edit_stage` auch schreiben. Wer nebenbei Admin ist, bekommt hier
        // trotzdem nur seine Bühnen: die Sicht folgt der Rolle des Portals.
        //
        // Konrad, 24.09.: „Die Speaker Leads dürfen die Slots ihrer Bühne im
        // Rahmen des Tages (also Startzeit und Endzeit fest) bearbeiten." Den
        // Rahmen hält die Datenbank (`outside_stage_day`), nicht diese Seite —
        // eine zweite Kopie der Regel hier liefe irgendwann auseinander.
        editableStageIds={scope.stages.map((s) => s.id)}
        events={board.events}
        currentEventId={board.currentEvent.id}
        currentEventSlug={board.currentEvent.slug}
        timezone={board.currentEvent.timezone}
        days={board.days}
        currentDayId={board.currentDay?.id ?? null}
        stages={board.stages}
        slots={board.slots}
        backlog={board.backlog}
        stats={board.stats}
        stageDays={board.stageDays}
        labels={board.labels}
        locale={board.locale}
        t={t.admin.programme}
        rpcMessages={t.rpc}
      />
    </>
  );
}
