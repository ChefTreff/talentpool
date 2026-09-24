import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgrammeTable } from "@/components/programme/ProgrammeTable";
import { TableTabs } from "@/components/programme/TableTabs";
import { loadProgrammeTable } from "@/components/programme/loadTable";

export const dynamic = "force-dynamic";

const BASE = "/admin/programm";

/**
 * Das Programm als Liste über alle Tage (Feedback-Runde 1, Punkt 6).
 * Gate je Seite; was editierbar ist, sagt `can_edit` je Zeile.
 */
export default async function ProgrammeTablePage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  await requireAdminSection("programme", `${BASE}/tabelle`);
  const { t } = await getI18n();
  const { event } = await searchParams;
  const data = await loadProgrammeTable({ eventSlug: event });

  return (
    <>
      <PageHeader word={t.admin.words.programme} title={t.admin.programme.title} description={t.admin.programme.lead} />
      <TableTabs basePath={BASE} />
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
          t={t.admin.programmeTable}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
