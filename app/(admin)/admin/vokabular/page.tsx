import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VocabToggle } from "./VocabToggle";

export const dynamic = "force-dynamic";

type Term = {
  vocabulary: string;
  key: string;
  label_de: string;
  label_en: string;
  active: boolean;
  parent_key: string | null;
};

export default async function VokabularPage() {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("vocab_term")
    .select("vocabulary,key,label_de,label_en,active,parent_key")
    .order("vocabulary")
    .order("sort_order");

  const terms = (data ?? []) as Term[];
  const groups: Record<string, Term[]> = {};
  for (const t of terms) (groups[t.vocabulary] ??= []).push(t);
  const names = Object.keys(groups).sort();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Vokabular</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {terms.length} Terms in {names.length} Vokabularen. „aktiv" steuert, ob ein
        Wert in den Formularen angeboten wird.
      </p>

      <div className="mt-6 space-y-8">
        {names.map((v) => (
          <section key={v}>
            <h2 className="mb-2 font-mono text-sm font-semibold">
              {v} <span className="text-zinc-500">({groups[v].length})</span>
            </h2>
            <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-black/10 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10">
                  <tr>
                    <th className="px-4 py-2">Key</th>
                    <th className="px-4 py-2">DE</th>
                    <th className="px-4 py-2">EN</th>
                    <th className="px-4 py-2">Parent</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {groups[v].map((t) => (
                    <tr
                      key={t.key}
                      className="border-b border-black/5 last:border-0 dark:border-white/5"
                    >
                      <td className="px-4 py-2 font-mono text-xs text-zinc-500">{t.key}</td>
                      <td className="px-4 py-2">{t.label_de}</td>
                      <td className="px-4 py-2 text-zinc-500">{t.label_en}</td>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-400">
                        {t.parent_key ?? ""}
                      </td>
                      <td className="px-4 py-2">
                        <VocabToggle vocabulary={v} termKey={t.key} active={t.active} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
