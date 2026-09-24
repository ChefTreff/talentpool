import "server-only";
import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubmissionQueue, type PendingSubmission } from "./SubmissionQueue";
import type { ManagerScope } from "@/app/(speaker-leads)/speaker-leads/types";

/**
 * Titel und Beschreibungen, die Speaker eingereicht haben — als **eine**
 * Seite für zwei Wege.
 *
 * Sie hängt im Lead-Portal (dort entsteht die Arbeit) und im Admin-Bereich
 * (Konrad arbeitet ausschliesslich dort, Regel „Admin-Vollständigkeit" vom
 * 22.09.). Dieselbe Komponente, dieselben RPCs, keine zweite Logik: was hier
 * steht, steht an beiden Stellen gleich.
 *
 * **Gefiltert wird nicht.** `pending_submissions` zeigt von sich aus nur, was
 * der Aufrufer entscheiden darf; `my_manager_scope` sagt, ob er überhaupt
 * darf. Ein Admin kommt über `is_speaker_team()` hinein, eine Leitung über
 * ihre Rolle — beide sehen genau ihren Ausschnitt.
 */
export async function EinreichungenSeite() {
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
        word={t.leads.wordSelection}
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
