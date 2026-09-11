import Link from "next/link";
import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { AreaShell } from "@/components/layout/AreaShell";

export const dynamic = "force-dynamic";

/**
 * Admin/Manager: Desktop-first, dichte Tabellen — deshalb die breite Fläche.
 * `requireArea("admin")` prüft serverseitig; der Proxy hat nur vorsortiert.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireArea("admin");
  const { t } = await getI18n();

  const items = [
    { href: "/admin", label: t.admin.nav.overview },
    { href: "/admin/programm", label: t.admin.nav.programme },
    { href: "/admin/bewerbungen", label: t.admin.nav.applications },
    { href: "/admin/partner", label: t.admin.nav.partners },
    { href: "/admin/rollen", label: t.admin.nav.roles },
    { href: "/admin/speaker-tickets", label: t.admin.nav.speakerTickets },
    { href: "/admin/reisekosten", label: t.admin.nav.expenses },
    { href: "/admin/hospitality", label: t.admin.nav.hospitality },
    { href: "/admin/technik", label: t.admin.nav.tech },
    { href: "/admin/fristen", label: t.admin.nav.deadlines },
    { href: "/admin/personen", label: t.admin.nav.persons },
    { href: "/admin/vokabular", label: t.admin.nav.vocab },
    { href: "/admin/dubletten", label: t.admin.nav.duplicates },
    { href: "/admin/mail", label: t.admin.nav.mail },
    { href: "/admin/ui", label: t.admin.nav.ui },
  ];

  return (
    <AreaShell area="admin" width="table">
      <nav
        aria-label={t.admin.brand}
        className="mb-8 flex flex-wrap gap-1 border-b pb-3"
      >
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
