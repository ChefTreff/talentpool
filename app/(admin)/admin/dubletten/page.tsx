import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("potential_duplicate")
    .select("id, person_id_a, person_id_b, score, signals, status")
    .order("score", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Dup[];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dubletten-Queue</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {rows.length} Kandidat(en). Wird durch die Migration / das Matching befüllt (P3).
      </p>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-black/15 p-8 text-center text-sm text-zinc-500 dark:border-white/15">
          Aktuell keine Dubletten-Kandidaten.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-black/10 p-4 dark:border-white/10"
            >
              <div className="text-sm">
                <div className="font-mono text-xs text-zinc-500">
                  {d.person_id_a.slice(0, 8)}… ↔ {d.person_id_b.slice(0, 8)}…
                </div>
                <div className="mt-1">
                  Score <span className="font-medium tabular-nums">{d.score}</span>
                  {d.signals && (
                    <span className="ml-2 text-zinc-500">
                      {Object.keys(d.signals).join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <DuplicateActions id={d.id} status={d.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
