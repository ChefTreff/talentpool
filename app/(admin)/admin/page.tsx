import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const admin = createSupabaseAdminClient();

  const [persons, regs, dupes, events, vocab] = await Promise.all([
    admin.from("person").select("id", { count: "exact" }).limit(1),
    admin.from("registration").select("id", { count: "exact" }).limit(1),
    admin
      .from("potential_duplicate")
      .select("id", { count: "exact" })
      .eq("status", "open")
      .limit(1),
    admin.from("event").select("id", { count: "exact" }).limit(1),
    admin.from("vocab_term").select("key", { count: "exact" }).limit(1),
  ]);

  const cards: { label: string; value: number; href?: string }[] = [
    { label: "Personen", value: persons.count ?? 0, href: "/admin/personen" },
    { label: "Registrierungen", value: regs.count ?? 0 },
    { label: "Offene Dubletten", value: dupes.count ?? 0, href: "/admin/dubletten" },
    { label: "Events", value: events.count ?? 0 },
    { label: "Vokabular-Terms", value: vocab.count ?? 0, href: "/admin/vokabular" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Übersicht</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const inner = (
            <>
              <div className="text-3xl font-semibold tabular-nums">{c.value}</div>
              <div className="mt-1 text-sm text-zinc-500">{c.label}</div>
            </>
          );
          return c.href ? (
            <Link
              key={c.label}
              href={c.href}
              className="rounded-xl border border-black/10 p-5 transition-colors hover:bg-black/[.03] dark:border-white/10 dark:hover:bg-white/[.04]"
            >
              {inner}
            </Link>
          ) : (
            <div key={c.label} className="rounded-xl border border-black/10 p-5 dark:border-white/10">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
