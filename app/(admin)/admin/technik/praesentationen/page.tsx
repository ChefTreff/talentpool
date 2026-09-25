import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PraesentationenListe } from "@/components/speaker/PraesentationenListe";
import { ladePraesentationen } from "@/lib/speaker/praesentationen";
import { registerPresentationAsAdmin } from "../../actions";

export const dynamic = "force-dynamic";

const PATH = "/admin/technik/praesentationen";

/**
 * LEAD-023 im Admin (Admin-Vollständigkeit): dieselbe Liste wie bei den Stage
 * Leads, über alle Bühnen — Konrad lädt eine per Mail eingesandte Datei hier
 * hoch, die Technik-Prüfung daneben bleibt, wie sie ist.
 */
export default async function AdminPraesentationenPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  await requireAdminSection("tech", PATH);
  const { locale, t } = await getI18n();
  const { event } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const data = await ladePraesentationen(supabase, { eventSlug: event, locale });

  return (
    <>
      <PageHeader word={t.admin.words.tech} title={t.presentationsList.title} description={t.presentationsList.leadAdmin} />
      <div className="mb-4">
        <ButtonLink href="/admin/technik" variant="ghost" size="sm">
          {t.presentationsList.backToCheck}
        </ButtonLink>
      </div>
      {!data.currentEvent || !data.editionId ? (
        <EmptyState title={t.admin.programme.noEventTitle} description={t.admin.programme.noEventBody} />
      ) : (
        <PraesentationenListe
          zeilen={data.zeilen}
          editionId={data.editionId}
          timezone={data.currentEvent.timezone}
          dateLocale={t.meta.dateLocale}
          register={registerPresentationAsAdmin}
          t={t.presentationsList}
          tCheck={{ pending: t.admin.tech.check_pending, checked: t.admin.tech.check_checked, issue: t.admin.tech.check_issue }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
