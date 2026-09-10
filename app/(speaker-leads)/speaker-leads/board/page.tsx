import { notFound } from "next/navigation";
import { requireAnyArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Board } from "@/components/programme/Board";
import { loadBoard } from "@/components/programme/load";
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
  await requireAnyArea(["admin", "speaker-leads"], PATH);
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
        <PageHeader title={t.leads.boardTitle} description={t.leads.boardLead} />
        <EmptyState
          title={t.admin.programme.noEventTitle}
          description={t.admin.programme.noEventBody}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.leads.boardTitle} description={t.leads.boardLead} />
      <Board
        basePath={PATH}
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
        labels={board.labels}
        locale={board.locale}
        t={t.admin.programme}
        rpcMessages={t.rpc}
      />
    </>
  );
}
