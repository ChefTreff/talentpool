import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  // Gate je Seite, nicht nur im Layout: Layouts rendern bei Client-Navigation
  // nicht neu. Muss vor createSupabaseAdminClient() stehen.
  await requireArea("admin", "/admin");
  const admin = createSupabaseAdminClient();
  const { t } = await getI18n();

  const [persons, regs, dupes, events, vocab] = await Promise.all([
    admin.from("person").select("id", { count: "exact", head: true }),
    admin.from("registration").select("id", { count: "exact", head: true }),
    admin
      .from("potential_duplicate")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    admin.from("event").select("id", { count: "exact", head: true }),
    admin.from("vocab_term").select("key", { count: "exact", head: true }),
  ]);

  const cards = [
    { label: t.admin.overview.persons, value: persons.count ?? 0, href: "/admin/personen" },
    { label: t.admin.overview.registrations, value: regs.count ?? 0 },
    {
      label: t.admin.overview.openDuplicates,
      value: dupes.count ?? 0,
      href: "/admin/dubletten",
    },
    { label: t.admin.overview.events, value: events.count ?? 0 },
    { label: t.admin.overview.vocabTerms, value: vocab.count ?? 0, href: "/admin/vokabular" },
  ];

  return (
    <>
      <PageHeader title={t.admin.overview.title} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) =>
          c.href ? (
            <Link
              key={c.label}
              href={c.href}
              className="rounded-ct-lg transition-colors hover:bg-surface-hover"
            >
              <StatCard label={c.label} value={c.value} />
            </Link>
          ) : (
            <StatCard key={c.label} label={c.label} value={c.value} />
          ),
        )}
      </div>
    </>
  );
}
