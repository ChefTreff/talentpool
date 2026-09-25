import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Board } from "@/components/programme/Board";
import { loadBoard } from "@/components/programme/load";
import { TableTabs } from "@/components/programme/TableTabs";
import { canPublishSessions } from "@/components/programme/permissions";

export const dynamic = "force-dynamic";

const PATH = "/admin/programm";

export default async function ProgrammPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; tag?: string }>;
}) {
  // Gate je Seite, nicht nur im Layout. Die Board-RPCs prüfen zusätzlich
  // can_edit_slot()/can_edit_session() — ein Speaker-Manager darf hier lesen,
  // aber nur im eigenen Scope schreiben.
  const { roleNames } = await requireAdminSection("programme", PATH);
  const { t } = await getI18n();
  const { event, tag } = await searchParams;

  // Das Team sieht alle Editionen; die Leads bekommen unter
  // `/speaker-leads/board` ihre eigene vorausgewählt.
  const board = await loadBoard({ eventSlug: event, day: tag });

  if (!board.currentEvent) {
    return (
      <>
        <PageHeader word={t.admin.words.programme} title={t.admin.programme.title} description={t.admin.programme.lead} />
        <TableTabs basePath={PATH} withRelease />
        <EmptyState
          title={t.admin.programme.noEventTitle}
          description={t.admin.programme.noEventBody}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader word={t.admin.words.programme} title={t.admin.programme.title} description={t.admin.programme.lead} />
      <TableTabs basePath={PATH} withRelease />
      <Board
        basePath={PATH}
        canPublish={canPublishSessions(roleNames)}
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
