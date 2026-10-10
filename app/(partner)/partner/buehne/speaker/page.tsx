import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { BUEHNE_GEBRANDET, buehnenSessions } from "@/components/partner/eure-buehne";
import { loadProgrammeTable } from "@/components/programme/loadTable";
import type { RueckgabeTexte } from "../../Rueckgabe";
import { canEditOnboarding, type PartnerOverview } from "../../types";
import { getPartnerScope } from "../../org";
import type { PartnerSpeaker } from "../../talk/types";
import { BuehnenTabs } from "../BuehnenTabs";
import { ladeBuehnen } from "../daten";
import { SessionKarte } from "./SessionKarte";

export const dynamic = "force-dynamic";

const BASE = "/partner/buehne";

/**
 * Die Speaker der gebrandeten Bühne (PART-138, K-84) — der Reiter, der auf der Standbühne „Gäste“ heißt. Eine gebrandete Bühne ist eine unserer Bühnen mit dem Partner als
 * Marke; wer dort spricht, ist ein **regulärer Speaker** (PART-091): Zugang, Pipeline und Onboarding wie bei jedem Partner-Speaker, der Partner trägt die Person nur ein
 * (`partner_add_speaker`, seit 0293 auch für Sessions ohne Organisation auf einer gebrandeten Bühne). Deshalb dieselben Bausteine wie auf der Talk-Seite
 * (`SpeakerHinzufuegen`, `SpeakerTabelle`), aber eine andere Quelle für die Programmpunkte: das Programm (`programme_board`, wie Kalender und Tabelle), nicht
 * `partner_format_sessions` — deren Liste gilt nur für Sessions mit eigener Organisation, und das Team legt sie auf einer gebrandeten Bühne ohne sie an (PART-148).
 *
 * Wer das Team schon eingetragen hat, steht als Zeile ohne Knopf darunter; die Titel und Zeiten pflegt der Partner im Kalender, veröffentlicht wird vom Programm-Team.
 */
export default async function PartnerStageSpeakersPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  await requireArea("partner", `${BASE}/speaker`);
  const { locale, t } = await getI18n("de");
  const { event } = await searchParams;
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const { eigene, reiter } = await ladeBuehnen(current.org_id);
  const gebrandet = eigene.filter((s) => s.kind === BUEHNE_GEBRANDET);

  const kopf = (
    <>
      <PageHeader word={t.partner.wordProgramme} title={t.partnerStage.title} description={t.partnerStage.lead} />
      <BuehnenTabs
        t={{
          label: t.partnerStage.title,
          board: t.admin.programmeTable.tabBoard,
          table: t.admin.programmeTable.tabTable,
          guests: t.partnerGuests.tab,
          speakers: t.partnerStage.tabSpeakers,
        }}
        reiter={reiter}
      />
    </>
  );

  if (gebrandet.length === 0) {
    return (
      <>
        {kopf}
        <EmptyState title={t.partnerStage.speakersNoStageTitle} description={t.partnerStage.speakersNoStageBody} />
      </>
    );
  }

  const data = await loadProgrammeTable({
    eventSlug: event ?? gebrandet[0].event_slug ?? undefined,
    fallbackLocale: "de",
    editionIds: [...new Set(gebrandet.map((s) => s.edition_id))],
  });
  if (!data.currentEvent) {
    return (
      <>
        {kopf}
        <EmptyState title={t.admin.programme.noEventTitle} description={t.admin.programme.noEventBody} />
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  const args = { p_org_id: current.org_id, p_edition_id: current.edition_id };
  const [{ data: overviewJson }, { data: speakerRows }, { data: kontaktZeilen }] = await Promise.all([
    supabase.rpc("partner_overview", args),
    supabase.rpc("partner_speakers", args),
    // PART-091: der Operations-Kontakt, über den im Verwaltet-Fall alles läuft.
    supabase.rpc("partner_contacts", { p_org_id: current.org_id }),
  ]);
  const overview = (overviewJson ?? null) as PartnerOverview | null;
  const canEdit = overview ? canEditOnboarding(overview.roles, overview.team) : false;
  const speakers = (speakerRows ?? []) as PartnerSpeaker[];
  const ops = ((kontaktZeilen ?? []) as { first_name: string | null; last_name: string | null; roles: string[] | null }[])
    .find((k) => (k.roles ?? []).includes("primary_ops"));
  const opsName = ops ? [ops.first_name, ops.last_name].filter(Boolean).join(" ") || null : null;

  const sessions = buehnenSessions(data.rows, new Set(gebrandet.map((s) => s.stage_id)));
  const rueckgabe: RueckgabeTexte = { badge: t.partner.returnedBadge, title: t.partner.returnedTitle, next: t.partner.returnedNext };

  return (
    <>
      {kopf}
      <p className="ct-help mb-4">{t.partnerStage.speakersLead}</p>
      {sessions.length === 0 ? (
        <EmptyState title={t.partnerStage.speakersEmptyTitle} description={t.partnerStage.speakersEmptyBody} />
      ) : (
        <div className="flex flex-col gap-4">
          {sessions.map((x) => (
            <SessionKarte
              key={x.sessionId}
              x={x}
              eigeneSpeaker={speakers.filter((sp) => sp.session_id === x.sessionId)}
              canEdit={canEdit}
              opsName={opsName}
              locale={locale}
              dateLocale={t.meta.dateLocale}
              formatLabel={data.labels.format}
              statusLabel={data.labels.publishStatus}
              rueckgabe={rueckgabe}
              mitBuehne={gebrandet.length > 1}
              s={t.partnerTalk as unknown as Record<string, string>}
              stage={t.partnerStage}
              rpcMessages={t.rpc}
            />
          ))}
          <p className="ct-help">{t.partnerStage.speakersHint}</p>
        </div>
      )}
    </>
  );
}
