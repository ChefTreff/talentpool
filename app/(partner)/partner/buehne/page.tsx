import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Board } from "@/components/programme/Board";
import { BuehnenTabs } from "./BuehnenTabs";
import { loadBoard } from "@/components/programme/load";
import { canPublishSessions } from "@/components/programme/permissions";
import { fensterText } from "@/components/partner/standbuehne";
import { formatDay } from "@/lib/tz";
import type { PartnerFormatSession } from "../talk/types";
import { RueckgabeHinweis, rueckgabeOffen } from "../Rueckgabe";
import { getPartnerScope } from "../org";
import { ladeEigeneBuehnen, ladeFenster } from "./daten";
import { StandInfo } from "./StandInfo";

export const dynamic = "force-dynamic";

const PATH = "/partner/buehne";

/**
 * Dasselbe Board wie im Admin- und Lead-Bereich, mit dem Blick eines
 * Bühnen-Editors: nur die Edition der eigenen Bühne, alles andere sichtbar,
 * aber unziehbar (`can_edit` je Zeile aus `programme_board`).
 *
 * Freigeben kann hier niemand — `publish_session` verlangt das Programm-Team.
 * „Veröffentlichen“ als Anfrage an die Programmleitung steht in der Tabelle
 * (PART-080, zweiter Reiter); im Board-Drawer folgt es über den Speaker-Chat.
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
  const stages = await ladeEigeneBuehnen();

  // Ohne eigene Bühne gibt es nichts zu zeigen — und das ist kein Fehler,
  // sondern der Stand: die Produktion richtet sie ein.
  if (stages.length === 0) {
    return (
      <>
        <PageHeader word={t.partner.wordProgramme} title={t.partnerStage.title} description={t.partnerStage.lead} />
        <EmptyState
          title={t.partnerStage.emptyTitle}
          description={t.partnerStage.emptyBody}
        />
      </>
    );
  }

  const editionIds = [...new Set(stages.map((s) => s.edition_id))];
  // Ohne Auswahl die Veranstaltung der eigenen Bühne — nicht die erste der Edition.
  const heimat = stages.find((s) => s.org_id === current.org_id) ?? stages[0];
  const board = await loadBoard({
    eventSlug: event ?? heimat.event_slug ?? undefined,
    day: tag,
    fallbackLocale: "de",
    editionIds,
  });

  if (!board.currentEvent) {
    return (
      <>
        <PageHeader word={t.partner.wordProgramme} title={t.partnerStage.title} description={t.partnerStage.lead} />
        <EmptyState
          title={t.admin.programme.noEventTitle}
          description={t.admin.programme.noEventBody}
        />
      </>
    );
  }

  const own = stages.map((s) => s.stage_name).filter(Boolean).join(" · ");

  // PART-079: das Zeitfenster der Standbühnen dieser Veranstaltung, je Tag.
  const eigeneIds = new Set(stages.map((st) => st.stage_id));
  const standbuehnen = board.stages.filter((st) => eigeneIds.has(st.id) && st.type === "partner_booth");
  const tage = board.days.map((d) => {
    const label = board.locale === "en" ? d.label_en ?? d.label_de : d.label_de ?? d.label_en;
    const datum = formatDay(d.day_date, t.meta.dateLocale);
    return { id: d.id, label: label ? `${label} · ${datum}` : datum };
  });
  const fenster = await ladeFenster(
    standbuehnen.map((st) => st.id),
    tage.map((d) => d.id),
  );
  const fensterListe = standbuehnen.flatMap((st) =>
    tage.map((d) => ({
      label: standbuehnen.length > 1 ? `${st.name} · ${d.label}` : d.label,
      text: fensterText(fenster[`${st.id}|${d.id}`], t.partnerStage.windowUntil),
    })),
  );

  // PART-083: zurückgegebene Sessions auf den eigenen Bühnen stehen über dem Board —
  // das Board selbst (components/programme/) gehört dem Speaker-Chat.
  const { data: sessionRows } = await supabase.rpc("partner_format_sessions", {
    p_org_id: current.org_id,
    p_edition_id: current.edition_id,
  });
  const zurueck = ((sessionRows ?? []) as PartnerFormatSession[])
    .filter(rueckgabeOffen)
    .filter((x) => x.stage_id && eigeneIds.has(x.stage_id));

  return (
    <>
      <PageHeader word={t.partner.wordProgramme} title={t.partnerStage.title} description={t.partnerStage.lead} />
      <BuehnenTabs t={{ label: t.partnerStage.title, board: t.admin.programmeTable.tabBoard, table: t.admin.programmeTable.tabTable, guests: t.partnerGuests.tab }} />
      <StandInfo eigene={own} fenster={fensterListe} t={t.partnerStage} hinweisAndere />
      {zurueck.length > 0 && (
        <section aria-labelledby="buehne-zurueck" className="mb-6">
          <h2 id="buehne-zurueck" className="ct-h2 mb-3 text-ink">
            {t.partner.returnedListTitle}
          </h2>
          <ul className="flex flex-col gap-3">
            {zurueck.map((x) => (
              <li key={x.id}>
                <p className="ct-label mb-1 text-ink">{x.title_de ?? x.title_en ?? t.partnerStage.title}</p>
                <RueckgabeHinweis
                  note={x.return_note}
                  returnedAt={x.returned_at}
                  dateLocale={t.meta.dateLocale}
                  t={{ badge: t.partner.returnedBadge, title: t.partner.returnedTitle, next: t.partner.returnedNext }}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      <Board
        basePath={PATH}
        canPublish={canPublishSessions(roleNames)}
        // Hier wird als Partner gearbeitet, nicht als das, was die Person
        // sonst noch ist (LEAD-016).
        editableStageIds={stages.map((st) => st.stage_id)}
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
