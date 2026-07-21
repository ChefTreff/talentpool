import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadVocabMap, vlabel } from "@/lib/vocab";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  occupation_status: string | null;
  created_at: string;
  person_email: { email: string; is_primary: boolean }[] | null;
};

export default async function PersonenPage() {
  const admin = createSupabaseAdminClient();
  const [{ data: persons }, vocab] = await Promise.all([
    admin
      .from("person")
      .select(
        "id, first_name, last_name, occupation_status, created_at, person_email(email, is_primary)",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    loadVocabMap(admin),
  ]);

  const rows = (persons ?? []) as Row[];

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Personen</h1>
        <span className="text-sm text-zinc-500">{rows.length} angezeigt</span>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">E-Mail (primär)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Erstellt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const primary =
                p.person_email?.find((e) => e.is_primary)?.email ??
                p.person_email?.[0]?.email ??
                "—";
              const name =
                [p.first_name, p.last_name].filter(Boolean).join(" ") || "(ohne Namen)";
              return (
                <tr
                  key={p.id}
                  className="border-b border-black/5 last:border-0 hover:bg-black/[.03] dark:border-white/5 dark:hover:bg-white/[.04]"
                >
                  <td className="px-4 py-3">
                    <Link href={`/admin/personen/${p.id}`} className="font-medium hover:underline">
                      {name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{primary}</td>
                  <td className="px-4 py-3">{vlabel(vocab, "occupation_status", p.occupation_status)}</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {new Date(p.created_at).toLocaleDateString("de-DE")}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  Noch keine Personen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
