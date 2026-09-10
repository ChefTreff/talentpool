import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubmissionQueue, type PendingSubmission } from "./SubmissionQueue";
import type { ManagerScope } from "../types";

export const dynamic = "force-dynamic";

/**
 * Titel und Beschreibung, die Speaker eingereicht haben.
 *
 * `pending_submissions` zeigt nur, was der Aufrufer entscheiden darf — seit
 * Migration 0037 auch dem Manager über `can_manage_speaker()`. Die Seite
 * filtert deshalb nichts nach; sie zeigt, was zurückkommt.
 */
export default async function SubmissionsPage() {
  await requireArea("speaker-leads", "/speaker-leads/einreichungen");
  const { locale, t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const [{ data: scopeJson }, { data: rows }, vocab] = await Promise.all([
    supabase.rpc("my_manager_scope"),
    supabase.rpc("pending_submissions"),
    loadVocabMap(supabase, locale),
  ]);

  const scope = (scopeJson ?? null) as ManagerScope | null;
  if (!scope?.is_manager) notFound();

  const submissions = (rows ?? []) as PendingSubmission[];

  return (
    <>
      <PageHeader
        title={t.leads.submissionsTitle}
        description={`${t.leads.submissionsLead} · ${submissions.length} ${t.leads.openCount}`}
      />
      {submissions.length === 0 ? (
        <EmptyState
          title={t.leads.submissionsEmptyTitle}
          description={t.leads.submissionsEmptyBody}
        />
      ) : (
        <SubmissionQueue
          submissions={submissions}
          languages={vgroup(vocab, "language")}
          publishStatus={vgroup(vocab, "publish_status")}
          dateLocale={t.meta.dateLocale}
          t={t.leadSubmissions}
          common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
