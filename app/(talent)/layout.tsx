import Link from "next/link";
import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { AreaShell } from "@/components/layout/AreaShell";

export const dynamic = "force-dynamic";

/** Talent-Bereich: jede eingeloggte Person, Top-Nav, mobile-first. */
export default async function TalentLayout({ children }: { children: ReactNode }) {
  await requireArea("talent");
  const { t } = await getI18n();

  const items = [
    { href: "/programm", label: t.programme.title },
    { href: "/meine", label: t.participation.title },
    { href: "/profil", label: t.profile.title },
  ];

  return (
    <AreaShell area="talent" width="content">
      <nav aria-label={t.areas.talent.name} className="mb-8 flex flex-wrap gap-1 border-b pb-3">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="rounded-ct-sm px-2.5 py-1.5 text-[14px] font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            {i.label}
          </Link>
        ))}
      </nav>
      {children}
    </AreaShell>
  );
}
