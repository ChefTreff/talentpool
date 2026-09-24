import { notFound } from "next/navigation";
import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { FristMarke } from "@/components/ui/FristMarke";
import { Ansprechpartner } from "@/components/kontakt/Ansprechpartner";
import { loadMyContacts } from "@/components/kontakt/load";
import { getPartnerScope } from "../org";
import { PflichtUpload } from "../PflichtUpload";
import { canEditOnboarding, type Deliverable, type PartnerOverview } from "../types";

export const dynamic = "force-dynamic";

/**
 * Hackathon (PART-033, HACK-005). Konrads Entscheidung vom 17.09.: Die
 * Partner-Verwaltung gehört ins Partner-Portal, `/hackathon` bleibt die
 * Teilnehmer-App. Wer beides hat, wechselt über den Umschalter.
 *
 * Die Seite bündelt, was ein Hackathon-Partner zu tun hat: **Challenge
 * einreichen** (das Formular gibt es seit Migration 0085 als Pflicht, es hatte
 * nur keinen eigenen Ort) und **Rückwand hochladen** (neu). Dazu die Frist als
 * Countdown und die Ansprechperson — die Fragen, die sonst per Mail kommen.
 *
 * Die Challenge selbst wird **nicht** hier angezeigt, nachdem sie eingereicht
 * ist: Sie erscheint nach der Freigabe in der Teilnehmer-App, und eine zweite
 * Darstellung hier wäre eine Kopie, die niemand pflegt.
 */
export default async function PartnerHackathonPage() {
  await requireArea("partner", "/partner/hackathon");
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const args = { p_org_id: current.org_id, p_edition_id: current.edition_id };
  const [{ data: overviewJson }, { data: deliverableRows }, kontakte] = await Promise.all([
    supabase.rpc("partner_overview", args),
    supabase.rpc("my_deliverables", args),
    loadMyContacts(current.edition_id),
  ]);

  const overview = (overviewJson ?? null) as PartnerOverview | null;
  const deliverables = (deliverableRows ?? []) as Deliverable[];
  const s = t.partnerHackathon;
  // Europe/Berlin ausdrücklich: der Server rendert in UTC.
  const dateTime = new Intl.DateTimeFormat(t.meta.dateLocale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });

  const gebucht = (overview?.products ?? []).filter((p) => p.format_key === "hackathon");
  const canEdit = overview ? canEditOnboarding(overview.roles, overview.team) : false;

  const challenge = deliverables.find((d) => d.key === "hackathon_challenge") ?? null;
  const backdrop = deliverables.find((d) => d.key === "hackathon_backdrop") ?? null;

  const label = (d: Deliverable) => (locale === "en" ? d.label_en : d.label_de) ?? d.key;
  const text = (d: Deliverable) => (locale === "en" ? d.description_en : d.description_de);
  const tone = (d: Deliverable) =>
    d.status === "accepted" ? "success" : d.status === "rejected" ? "error" : "neutral";

  return (
    <>
      <PageHeader word={t.partner.wordChallenge} title={s.title} description={s.lead} />

      {gebucht.length === 0 ? (
        <EmptyState
          title={s.emptyTitle}
          description={s.emptyBody}
          action={
            <Link href="/partner/checkliste" className="ct-link">
              {s.toChecklist}
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Die Challenge: das Herz der Partnerschaft. Sie steht zuerst, weil
              ohne sie kein Team etwas zu tun hat. */}
          {challenge && (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="ct-h3 text-ink">{label(challenge)}</h2>
                  <Badge tone={tone(challenge)}>
                    {t.partner[`deliverable_${challenge.status}` as keyof typeof t.partner] as string}
                  </Badge>
                </div>
                {/* Frist im Kopf, rechts (QS-044). */}
                {challenge.due_at && challenge.status !== "accepted" && (
                  <FristMarke
                    className="ml-auto"
                    dueAt={challenge.due_at}
                    dateText={dateTime.format(new Date(challenge.due_at))}
                    t={{ label: s.challengeDue, days: t.partner.countdownDays, hours: t.partner.countdownHours, soon: t.partner.countdownSoon, passed: t.common.deadlinePassed, done: t.common.deadlineDone }}
                  />
                )}
              </div>
              {text(challenge) && <p className="ct-small mt-2 leading-6">{text(challenge)}</p>}
              {/* Ausgefüllt wird das Formular in der Checkliste — dort steht es
                  mit allen Feldern. Zwei Formulare für dieselbe Pflicht wären
                  zwei Stände derselben Antwort. */}
              <div className="mt-4">
                <ButtonLink href="/partner/checkliste" variant="secondary">
                  {challenge.status === "open" || challenge.status === "rejected"
                    ? s.challengeFill
                    : s.challengeView}
                </ButtonLink>
              </div>
              {challenge.status === "submitted" && (
                <p className="ct-help mt-2">{s.challengeSubmitted}</p>
              )}
              {challenge.review_note && (
                <p className="ct-help mt-2 text-warning-ink">{challenge.review_note}</p>
              )}
            </Card>
          )}

          {/* Die Rückwand: eigener Upload für die Challenge Area (PART-033). */}
          {backdrop && (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="ct-h3 text-ink">{label(backdrop)}</h2>
                  <Badge tone={tone(backdrop)}>
                    {t.partner[`deliverable_${backdrop.status}` as keyof typeof t.partner] as string}
                  </Badge>
                </div>
                {/* Frist im Kopf, rechts (QS-044). */}
                {backdrop.due_at && backdrop.status !== "accepted" && (
                  <FristMarke
                    className="ml-auto"
                    dueAt={backdrop.due_at}
                    dateText={dateTime.format(new Date(backdrop.due_at))}
                    t={{ label: s.backdropDue, days: t.partner.countdownDays, hours: t.partner.countdownHours, soon: t.partner.countdownSoon, passed: t.common.deadlinePassed, done: t.common.deadlineDone }}
                  />
                )}
              </div>
              {text(backdrop) && <p className="ct-small mt-2 leading-6">{text(backdrop)}</p>}
              {/* Das Endformat steht als eigene Zeile, obwohl es auch in der
                  Beschreibung vorkommt: es ist die erste Zahl, nach der jemand
                  sucht, der die Datei bauen soll (Konrad 21.09.). */}
              <p className="ct-help mt-2">{s.backdropSize}</p>
              <div className="mt-4">
                <PflichtUpload
                  orgId={current.org_id}
                  editionId={current.edition_id}
                  deliverable={backdrop}
                  canEdit={canEdit}
                  locked={backdrop.due_at !== null && new Date(backdrop.due_at) < new Date()}
                  dateLocale={t.meta.dateLocale}
                  t={s}
                  rpcMessages={t.rpc}
                  labelFirst={s.backdropUpload}
                  labelNew={s.backdropUploadNew}
                />
              </div>
            </Card>
          )}

          <Card>
            <h2 className="ct-h2 text-ink">{s.appTitle}</h2>
            <p className="ct-small mt-1 leading-6">{s.appBody}</p>
            <div className="mt-4">
              <ButtonLink href="/hackathon" variant="secondary">
                {s.appAction}
              </ButtonLink>
            </div>
          </Card>

          {/* Ansprechperson: dieselbe Komponente wie überall, damit eine Frage
              nicht in einer Mailbox landet (Konrads Serviceversprechen). */}
          <Ansprechpartner
            kontakte={kontakte.filter((k) => k.via === "partner")}
            locale={locale}
            title={t.partner.contactsTitle}
            lead={t.partner.contactLead}
            buddy={t.partner.contactBuddy}
          />
        </div>
      )}
    </>
  );
}
