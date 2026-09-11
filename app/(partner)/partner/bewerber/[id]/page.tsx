import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPartnerScope } from "../../org";
import {
  canEditOnboarding,
  type PartnerApplication,
  type PartnerOverview,
  type PartnerSession,
} from "../../types";
import { ApplicantList } from "./ApplicantList";

export const dynamic = "force-dynamic";

/**
 * Bewerberliste einer Session.
 *
 * `partner_applications` schreibt **jeden Abruf ins Audit** (Masterplan §4) —
 * das steht auch so auf der Seite. Fremde Sessions antwortet die RPC mit
 * 42501; die Seite prüft zusätzlich, dass die Session zur gewählten Org
 * gehört, damit aus einem Tippfehler in der URL kein Fehlerdialog wird.
 */
export default async function PartnerApplicantsSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireArea("partner", `/partner/bewerber/${id}`);
  const { locale, t } = await getI18n("de");
  const { current } = await getPartnerScope();
  if (!current) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: sessionRows }, { data: overviewJson }] = await Promise.all([
    supabase.rpc("partner_sessions", { p_org_id: current.org_id }),
    supabase.rpc("partner_overview", {
      p_org_id: current.org_id,
      p_edition_id: current.edition_id,
    }),
  ]);
  const session = ((sessionRows ?? []) as PartnerSession[]).find((s) => s.id === id);
  if (!session) notFound();

  const [{ data: applicationRows, error }, vocab] = await Promise.all([
    supabase.rpc("partner_applications", { p_session_id: id }),
    loadVocabMap(supabase, locale),
  ]);
  const overview = (overviewJson ?? null) as PartnerOverview | null;

  const title =
    (locale === "en" ? session.title_en : session.title_de) ??
    session.title_de ??
    session.title_en ??
    "—";

  // 42501: Rolle reicht nicht (etwa `event_app_member`). Kein Fehlerdialog,
  // sondern die Auskunft, woran es liegt.
  if (error) {
    return (
      <>
        <PageHeader title={title} description={t.partnerApplicants.lead} />
        <EmptyState
          title={t.partnerApplicants.noRightsTitle}
          description={t.partnerApplicants.noRightsBody}
        />
      </>
    );
  }

  const applications = (applicationRows ?? []) as PartnerApplication[];

  return (
    <>
      <PageHeader title={title} description={t.partnerApplicants.lead} />
      <Link href="/partner/bewerber" className="ct-link mb-4 inline-block">
        {t.partnerApplicants.backToSessions}
      </Link>

      <Card className="mb-6">
        <p className="ct-help">{t.partnerApplicants.auditNotice}</p>
        <p className="ct-help mt-2">
          {session.released
            ? t.partnerApplicants.released
            : t.partnerApplicants.notReleasedLong}
        </p>
      </Card>

      {applications.length === 0 ? (
        <EmptyState
          title={t.partnerApplicants.noApplicantsTitle}
          description={t.partnerApplicants.noApplicantsBody}
        />
      ) : (
        <ApplicantList
          applications={applications}
          statusLabels={vgroup(vocab, "application_status")}
          canDecide={canEditOnboarding(overview?.roles ?? [], overview?.team ?? false)}
          dateLocale={t.meta.dateLocale}
          t={t.partnerApplicants}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
