import { notFound } from "next/navigation";
import { requireAnyArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgrammeTable } from "@/components/programme/ProgrammeTable";
import { TableTabs } from "@/components/programme/TableTabs";
import { loadProgrammeTable } from "@/components/programme/loadTable";
import type { ManagerScope } from "../../types";

export const dynamic = "force-dynamic";

const BASE = "/speaker-leads/board";

/**
 * Dieselbe Tabelle wie im Admin-Bereich, mit dem Blick eines Leads: die eigene
 * Edition ist vorausgewählt, fremde tauchen nicht auf. Fremde Bühnen bleiben
 * sichtbar, aber unveränderlich — `can_edit` kommt je Zeile aus der Datenbank.
 */
export default async function LeadProgrammeTablePage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  await requireAnyArea(["admin", "speaker-leads"], `${BASE}/tabelle`);
  const { t } = await getI18n("de");
  const { event } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: scopeJson } = await supabase.rpc("my_manager_scope");
  const scope = (scopeJson ?? null) as ManagerScope | null;
  if (!scope?.is_manager) notFound();

  const editionIds = scope.all ? [] : [...new Set(scope.editions.map((e) => e.id))];
  const data = await loadProgrammeTable({ eventSlug: event, fallbackLocale: "de", editionIds, mitVerantwortlichen: true });

  return (
    <>
      <PageHeader word={t.leads.wordProgramme} title={t.leads.boardTitle} description={t.leads.boardLead} />
      <TableTabs basePath={BASE} locale="de" />
      {!data.currentEvent ? (
        <EmptyState
          title={t.admin.programme.noEventTitle}
          description={t.admin.programme.noEventBody}
        />
      ) : (
        <ProgrammeTable
          rows={data.rows}
          stages={data.stages}
          days={data.days}
          labels={data.labels}
          locale={data.locale}
          timezone={data.currentEvent.timezone}
          verantwortliche={data.verantwortliche}
          ownerCandidates={data.ownerCandidates}
          canSetOwner={data.canSetOwner}
          t={t.admin.programmeTable}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
