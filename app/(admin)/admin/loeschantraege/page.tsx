import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { AntraegeView, type Antrag } from "./AntraegeView";

export const dynamic = "force-dynamic";

/**
 * Die Warteschlange der Löschanträge.
 *
 * Hier landet nur, wessen Löschung nicht von allein durchging — an der Person
 * hängt eine Rolle, eine Zusage oder eine Organisation. Wer nichts davon hat,
 * löscht selbst und taucht hier nie auf.
 */
export default async function LoeschantraegePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminSection("deletions", "/admin/loeschantraege");
  const { t } = await getI18n("de");
  const { status } = await searchParams;
  const gewaehlt = status === "all" ? null : (status ?? "pending");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("deletion_requests_admin", { p_status: gewaehlt });

  return (
    <div className="max-w-detail">
      <PageHeader word={t.admin.words.deletions} title={t.adminDeletions.title} description={t.adminDeletions.lead} />
      {error ? (
        <EmptyState title={t.adminDeletions.noAccessTitle} description={t.adminDeletions.noAccessBody} />
      ) : (
        <AntraegeView
          antraege={(data ?? []) as Antrag[]}
          status={gewaehlt ?? "all"}
          dateLocale={t.meta.dateLocale}
          t={t.adminDeletions}
          blockerLabels={t.deletionBlockers}
          common={{ cancel: t.common.cancel, none: t.common.none }}
          rpcMessages={t.rpc}
        />
      )}
    </div>
  );
}
