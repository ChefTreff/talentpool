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
import type { PartnerFormatSession, PartnerSpeaker } from "../../talk/types";
import { BuehnenTabs } from "../BuehnenTabs";
import { ladeBuehnen } from "../daten";
import { SessionKarte } from "./SessionKarte";

export const dynamic = "force-dynamic";

const BASE = "/partner/buehne";

/**
 * Die Speaker der gebrandeten Bühne (PART-138, K-84) — der Reiter, der auf der Standbühne „Gäste“ heißt. Eine gebrandete Bühne ist eine unserer Bühnen mit dem Partner als
 * Marke; wer dort spricht, ist ein **regulärer Speaker** (PART-091): Zugang, Pipeline und Onboarding wie bei jedem Partner-Speaker, der Partner trägt die Person nur ein
 * (`partner_add_speaker`, seit 0293 auch für Sessions ohne Organisation auf einer gebrandeten Bühne). Deshalb dieselben Bausteine wie auf der Talk-Seite
 * (`SpeakerHinzufuegen`, `SpeakerTabelle`), aber eine andere Quelle für die Programmpunkte: das Programm (`programme_board`, wie Kalender und Tabelle) — das Team legt sie auf einer
 * gebrandeten Bühne ohne Organisation an. Dazu kommt je Programmpunkt die Zeile aus `partner_format_sessions` (seit 0315 / PART-148 B auch für Sessions ohne Organisation auf der
 * gebrandeten Bühne): Stand, Rückgabe der Programmleitung und Pflichtfelder für „Veröffentlichen“ (PART-148 c, `partner_request_publish` kennt die gebrandete Bühne).
 *
 * Wer das Team schon eingetragen hat, steht als Zeile ohne Knopf darunter; Titel und Zeiten pflegt der Partner im Kalender, die Anfrage zur Veröffentlichung stellt er hier oder dort,
 * freigegeben wird von der Programmleitung (Admin, „Freigaben“).
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
  const [{ data: overviewJson }, { data: speakerRows }, { data: kontaktZeilen }, { data: sessionRows }] = await Promise.all([
    supabase.rpc("partner_overview", args),
    supabase.rpc("partner_speakers", args),
    // PART-091: der Operations-Kontakt, über den im Verwaltet-Fall alles läuft.
    supabase.rpc("partner_contacts", { p_org_id: current.org_id }),
    // PART-148 c: Stand, Rückgabegrund und Pflichtfelder je Programmpunkt (auch Sessions ohne Organisation auf der gebrandeten Bühne).
    supabase.rpc("partner_format_sessions", args),
  ]);
  const overview = (overviewJson ?? null) as PartnerOverview | null;
  const canEdit = overview ? canEditOnboarding(overview.roles, overview.team) : false;
  const speakers = (speakerRows ?? []) as PartnerSpeaker[];
  const details = new Map(((sessionRows ?? []) as PartnerFormatSession[]).map((z) => [z.id, z]));
  const ops = ((kontaktZeilen ?? []) as { first_name: string | null; last_name: string | null; roles: string[] | null }[])
    .find((k) => (k.roles ?? []).includes("primary_ops"));
  const opsName = ops ? [ops.first_name, ops.last_name].filter(Boolean).join(" ") || null : null;

  const sessions = buehnenSessions(data.rows, new Set(gebrandet.map((s) => s.stage_id)));
  const rueckgabe: RueckgabeTexte = { badge: t.partner.returnedBadge, title: t.partner.returnedTitle, next: t.partner.returnedNext };
  // Der Kalender derselben Veranstaltung: dort pflegt der Partner, was für die Anfrage noch fehlt.
  const kalenderHref = event ? `${BASE}?event=${encodeURIComponent(event)}` : BASE;

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
              detail={details.get(x.sessionId) ?? null}
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
              kalenderHref={kalenderHref}
            />
          ))}
          <p className="ct-help">{t.partnerStage.speakersHint}</p>
        </div>
      )}
    </>
  );
}
