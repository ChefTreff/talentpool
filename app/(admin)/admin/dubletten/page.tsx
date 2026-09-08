import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { DuplicateActions } from "./DuplicateActions";

export const dynamic = "force-dynamic";

type Dup = {
  id: string;
  person_id_a: string;
  person_id_b: string;
  score: number;
  signals: Record<string, unknown> | null;
  status: string;
};

export default async function DublettenPage() {
  // Gate je Seite, nicht nur im Layout: Layouts rendern bei Client-Navigation
  // nicht neu. Muss vor createSupabaseAdminClient() stehen.
  await requireArea("admin", "/admin/dubletten");
  const admin = createSupabaseAdminClient();
  const { t } = await getI18n();

  const { data } = await admin
    .from("potential_duplicate")
    .select("id, person_id_a, person_id_b, score, signals, status")
    .order("score", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Dup[];

  return (
    <>
      <PageHeader
        title={t.admin.duplicates.title}
        description={`${rows.length} ${t.admin.duplicates.candidates}. ${t.admin.duplicates.lead}`}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={t.admin.duplicates.emptyTitle}
          description={t.admin.duplicates.emptyBody}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((d) => (
            <Card
              as="li"
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div>
                <div className="font-mono text-[13px] text-muted">
                  {d.person_id_a.slice(0, 8)}… ↔ {d.person_id_b.slice(0, 8)}…
                </div>
                <div className="mt-1 text-[15px]">
                  {t.admin.duplicates.score}{" "}
                  <span className="tabular-nums">{d.score}</span>
                  {d.signals && (
                    <span className="ml-2 text-muted">
                      {Object.keys(d.signals).join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <DuplicateActions
                id={d.id}
                status={d.status}
                labels={{
                  isDupe: t.admin.duplicates.isDupe,
                  notDupe: t.admin.duplicates.notDupe,
                  open: t.admin.duplicates.open,
                }}
              />
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}
