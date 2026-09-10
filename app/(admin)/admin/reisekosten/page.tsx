import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ExpenseQueue, type QueueClaim } from "./ExpenseQueue";

export const dynamic = "force-dynamic";

export default async function AdminExpensesPage() {
  await requireArea("admin", "/admin/reisekosten");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const [{ data: rows, error }, vocab] = await Promise.all([
    supabase.rpc("expense_queue"),
    loadVocabMap(supabase, locale),
  ]);

  // `expense_queue` prüft `is_expense_approver()` — wer das nicht ist, sieht
  // hier nichts, auch wenn er sonst im Admin-Bereich zu Hause ist.
  if (error) {
    return (
      <>
        <PageHeader title={t.admin.expenses.title} description={t.admin.expenses.lead} />
        <EmptyState
          title={t.admin.expenses.noAccessTitle}
          description={t.admin.expenses.noAccessBody}
        />
      </>
    );
  }

  const claims = (rows ?? []) as QueueClaim[];
  const open = claims.filter((c) => c.status === "submitted").length;

  return (
    <>
      <PageHeader
        title={t.admin.expenses.title}
        description={`${t.admin.expenses.lead} · ${open} ${t.admin.expenses.openCount}`}
      />
      {claims.length === 0 ? (
        <EmptyState
          title={t.admin.expenses.emptyTitle}
          description={t.admin.expenses.emptyBody}
        />
      ) : (
        <ExpenseQueue
          claims={claims}
          categories={vgroup(vocab, "expense_category")}
          dateLocale={t.meta.dateLocale}
          t={t.admin.expenses}
          common={{ cancel: t.common.cancel, none: t.common.none, save: t.common.save }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
