import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { DeadlineList, type DeadlineRow } from "./DeadlineList";

export const dynamic = "force-dynamic";

export default async function AdminDeadlinesPage() {
  await requireArea("admin", "/admin/fristen");
  const { locale, t } = await getI18n();
  const supabase = await createSupabaseServerClient();

  const [{ data: rows }, { data: events }] = await Promise.all([
    supabase
      .from("deadline")
      .select(
        "id, edition_id, key, audience, due_at, label_de, label_en, description_de, description_en, reminder_lead_hours",
      )
      .order("due_at"),
    supabase.from("event").select("id, name, slug").eq("is_edition", true),
  ]);

  const deadlines = (rows ?? []) as DeadlineRow[];
  const editions = ((events ?? []) as { id: string; name: string | null; slug: string }[]).map(
    (e) => ({ id: e.id, name: e.name ?? e.slug }),
  );

  return (
    <>
      <PageHeader title={t.admin.deadlines.title} description={t.admin.deadlines.lead} />
      {editions.length === 0 ? (
        <EmptyState
          title={t.admin.deadlines.emptyTitle}
          description={t.admin.deadlines.emptyBody}
        />
      ) : (
        <DeadlineList
          deadlines={deadlines}
          editions={editions}
          locale={locale}
          dateLocale={t.meta.dateLocale}
          t={t.admin.deadlines}
          common={{ choose: t.common.choose, none: t.common.none, save: t.common.save }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
