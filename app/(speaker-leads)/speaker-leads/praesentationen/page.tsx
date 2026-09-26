import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PraesentationenListe } from "@/components/speaker/PraesentationenListe";
import { ladePraesentationen } from "@/lib/speaker/praesentationen";
import { registerPresentationAsLead } from "../actions";
import type { ManagerScope } from "../types";

export const dynamic = "force-dynamic";

const PATH = "/speaker-leads/praesentationen";

/**
 * Präsentationen je Slot (LEAD-023): alle Slots der eigenen Bühnen mit Stand
 * und Upload — für Dateien, die per Mail kommen. Welche Slots das sind, sagt
 * die Datenbank (`can_edit` aus `programme_board`), nicht die Seite.
 */
export default async function LeadPraesentationenPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  await requireArea("speaker-leads", PATH);
  const { locale, t } = await getI18n("de");
  const { event } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: scopeJson } = await supabase.rpc("my_manager_scope");
  const scope = (scopeJson ?? null) as ManagerScope | null;
  if (!scope?.is_manager) notFound();

  const editionIds = scope.all ? [] : [...new Set(scope.editions.map((e) => e.id))];
  const data = await ladePraesentationen(supabase, { eventSlug: event, editionIds, locale });

  return (
    <>
      <PageHeader word={t.leads.wordProgramme} title={t.presentationsList.title} description={t.presentationsList.leadLeads} />
      {!data.currentEvent || !data.editionId ? (
        <EmptyState title={t.admin.programme.noEventTitle} description={t.admin.programme.noEventBody} />
      ) : (
        <PraesentationenListe
          zeilen={data.zeilen}
          editionId={data.editionId}
          timezone={data.currentEvent.timezone}
          dateLocale={t.meta.dateLocale}
          register={registerPresentationAsLead}
          t={t.presentationsList}
          tCheck={{ pending: t.admin.tech.check_pending, checked: t.admin.tech.check_checked, issue: t.admin.tech.check_issue }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
