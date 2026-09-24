import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/auth";
import { canEnterAdminSection } from "@/lib/admin-sections";
import { getI18n } from "@/lib/i18n";
import { ButtonLink } from "@/components/ui/Button";
import { HeroBand, BandStat } from "@/components/ui/HeroBand";
import { PhotoCard } from "@/components/ui/PhotoCard";
import { StatCard } from "@/components/ui/Card";
import { einstiegeMitAusnahmen } from "./einstiege.server";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  // Gate je Seite, nicht nur im Layout: Layouts rendern bei Client-Navigation
  // nicht neu. Muss vor createSupabaseAdminClient() stehen.
  const { firstName, roleNames } = await requireAdminSection("overview", "/admin");
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

  const vorname = firstName?.trim() || null;
  const offeneDubletten = dupes.count ?? 0;
  const nav = t.admin.nav;
  const woerter: Record<string, string> = t.admin.words;
  const saetze: Record<string, string> = t.admin.entries;
  // Die drei Einstiege nach Rolle (QS-037) — Auswahl und Begründung in ./einstiege.ts.
  const einstiege = await einstiegeMitAusnahmen(roleNames);

  return (
    <>
      {/* Hero-Band auf jeder Startseite (Konrad, 17.09.). Rechts steht die
          Zahl, die zum Handeln auffordert — offene Dubletten sind das
          einzige auf dieser Seite, das liegen bleibt, wenn niemand hinsieht.

          Seit QS-037 nach dem Vorbild der Talent-Startseite: Gruss mit dem
          einen Wort im Highlight-Pink, und die Zahl rechts bekommt ihren
          Knopf — aber nur, wenn es etwas zu prüfen gibt und die Rolle die
          Dubletten öffnen darf. */}
      <HeroBand
        eyebrow={t.areas.admin.portal}
        title={vorname ? t.admin.overview.bandGreeting.replace("{name}", vorname) : t.admin.overview.title}
        highlight={vorname ? t.admin.overview.bandHighlight : undefined}
        lead={t.admin.overview.lead}
        action={
          offeneDubletten > 0 && canEnterAdminSection("duplicates", roleNames) ? (
            <ButtonLink href="/admin/dubletten">{t.admin.overview.bandActionDuplicates}</ButtonLink>
          ) : undefined
        }
        aside={
          <BandStat
            value={String(dupes.count ?? 0)}
            label={t.admin.overview.openDuplicates}
            hint={(dupes.count ?? 0) > 0 ? t.admin.overview.bandHintOpen : t.admin.overview.bandHintClear}
          />
        }
      />

      {einstiege.length > 0 && (
        <div className="mb-10 grid gap-6 sm:grid-cols-3">
          {einstiege.map((e) => (
            <PhotoCard
              key={e.key}
              word={woerter[e.key]}
              title={nav[e.nav]}
              description={saetze[e.key]}
              action={
                <ButtonLink href={e.href} variant="secondary" size="sm">
                  {t.admin.overview.entryOpen.replace("{title}", nav[e.nav])}
                </ButtonLink>
              }
            />
          ))}
        </div>
      )}

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
