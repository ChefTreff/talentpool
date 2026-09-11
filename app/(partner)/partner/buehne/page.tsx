import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Board } from "@/components/programme/Board";
import { loadBoard } from "@/components/programme/load";
import { canPublishSessions } from "@/components/programme/permissions";
import { getPartnerScope } from "../org";

export const dynamic = "force-dynamic";

const PATH = "/partner/buehne";

/** Zeile aus `my_partner_stages()`. */
type PartnerStage = {
  stage_id: string;
  stage_name: string | null;
  stage_slug: string | null;
  event_id: string;
  event_slug: string | null;
  event_name: string | null;
  edition_id: string;
  org_id: string | null;
  org_name: string | null;
};

/**
 * Dasselbe Board wie im Admin- und Lead-Bereich, mit dem Blick eines
 * Bühnen-Editors: nur die Edition der eigenen Bühne, alles andere sichtbar,
 * aber unziehbar (`can_edit` je Zeile aus `programme_board`).
 *
 * Veröffentlichen gibt es hier nicht — `publish_session` verlangt das
 * Programm-Team. Statt eines Knopfes, der immer in 42501 liefe, steht im
 * Drawer, wer entscheidet.
 */
export default async function PartnerStagePage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; tag?: string }>;
}) {
  const { roleNames } = await requireArea("partner", PATH);
  const { t } = await getI18n("de");
  const { event, tag } = await searchParams;
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: stageRows } = await supabase.rpc("my_partner_stages");
  const stages = (stageRows ?? []) as PartnerStage[];

  // Ohne eigene Bühne gibt es nichts zu zeigen — und das ist kein Fehler,
  // sondern der Stand: die Produktion richtet sie ein.
  if (stages.length === 0) {
    return (
      <>
        <PageHeader title={t.partnerStage.title} description={t.partnerStage.lead} />
        <EmptyState
          title={t.partnerStage.emptyTitle}
          description={t.partnerStage.emptyBody}
        />
      </>
    );
  }

  const editionIds = [...new Set(stages.map((s) => s.edition_id))];
  const board = await loadBoard({
    eventSlug: event,
    day: tag,
    fallbackLocale: "de",
    editionIds,
  });

  if (!board.currentEvent) {
    return (
      <>
        <PageHeader title={t.partnerStage.title} description={t.partnerStage.lead} />
        <EmptyState
          title={t.admin.programme.noEventTitle}
          description={t.admin.programme.noEventBody}
        />
      </>
    );
  }

  const own = stages.map((s) => s.stage_name).filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader title={t.partnerStage.title} description={t.partnerStage.lead} />
      <Card className="mb-6">
        <p className="ct-help">
          {t.partnerStage.ownStages}: <span className="font-semibold text-ink">{own}</span>
        </p>
        <p className="ct-help mt-1">{t.partnerStage.readOnlyHint}</p>
        <p className="ct-help mt-1">{t.partnerStage.releaseHint}</p>
      </Card>
      <Board
        basePath={PATH}
        canPublish={canPublishSessions(roleNames)}
        hostOrgId={current.org_id}
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
