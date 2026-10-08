import Link from "next/link";
import { requireAdminSection } from "@/lib/auth";
import { mayEnterAdminSection } from "@/lib/admin-access";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Board } from "@/components/programme/Board";
import { leseBuehnenWahl } from "@/components/programme/buehnen";
import { ChipLink } from "@/components/ui/Chip";
import { loadBoard } from "@/components/programme/load";
import { TableTabs } from "@/components/programme/TableTabs";
import { canPublishSessions } from "@/components/programme/permissions";

export const dynamic = "force-dynamic";

const PATH = "/admin/programm";

export default async function ProgrammPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; tag?: string; buehnen?: string }>;
}) {
  // Gate je Seite, nicht nur im Layout. Die Board-RPCs prüfen zusätzlich
  // can_edit_slot()/can_edit_session() — ein Speaker-Manager darf hier lesen,
  // aber nur im eigenen Scope schreiben.
  const { roleNames } = await requireAdminSection("programme", PATH);
  const { t } = await getI18n();
  const { event, tag, buehnen } = await searchParams;
  // LEAD-061: unter /admin/programm wählt das Team — Standard alle Bühnen; das Stage-Lead-Board zeigt fest die Hauptbühnen.
  const wahl = leseBuehnenWahl(buehnen);

  // Das Team sieht alle Editionen; die Leads bekommen unter
  // `/speaker-leads/board` ihre eigene vorausgewählt.
  const board = await loadBoard({ eventSlug: event, day: tag, buehnen: wahl });
  // LEAD-018: Bühnen und Öffnungszeiten pflegt das Team im Gerüst der Edition
  // (`upsert_stage`/`upsert_stage_day`) — das Board verlinkt dorthin, wo die
  // Person den Abschnitt auch öffnen darf.
  const zumGeruest = await mayEnterAdminSection("edition", roleNames);

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

  const eventSlug = board.currentEvent.slug;
  const tagZusatz = board.currentDay ? `&tag=${board.currentDay.day_date}` : "";

  return (
    <>
      <PageHeader word={t.admin.words.programme} title={t.admin.programme.title} description={t.admin.programme.lead} />
      <TableTabs basePath={PATH} withRelease />
      {zumGeruest && (
        <p className="-mt-2 mb-4">
          <Link href="/admin/edition#zeiten" className="ct-link ct-small">
            {t.admin.programme.editionLink}
          </Link>
        </p>
      )}
      {/* LEAD-061: der Umschalter steht über dem Board; die Wahl bleibt beim Wechsel von Tag und Veranstaltung (`linkZusatz`). */}
      <nav aria-label={t.admin.programme.stagesFilter} className="mb-4 flex flex-wrap items-center gap-1">
        <span className="ct-eyebrow mr-2 text-muted">{t.admin.programme.stagesFilter}</span>
        {(["alle", "haupt"] as const).map((w) => (
          <ChipLink
            key={w}
            aktiv={wahl === w}
            href={`${PATH}?event=${eventSlug}${tagZusatz}${w === "haupt" ? "&buehnen=haupt" : ""}`}
          >
            {w === "alle" ? t.admin.programme.stagesAll : t.admin.programme.stagesMain}
          </ChipLink>
        ))}
      </nav>
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
        sperrzeiten={board.sperrzeiten}
        linkZusatz={wahl === "haupt" ? "&buehnen=haupt" : ""}
        labels={board.labels}
        locale={board.locale}
        t={t.admin.programme}
        rpcMessages={t.rpc}
      />
    </>
  );
}
