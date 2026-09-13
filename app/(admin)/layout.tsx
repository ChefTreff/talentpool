import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { SidebarShell } from "@/components/layout/SidebarShell";

export const dynamic = "force-dynamic";

/**
 * Admin/Manager: Desktop-first, dichte Tabellen.
 * `requireArea("admin")` prüft serverseitig; der Proxy hat nur vorsortiert.
 *
 * Die Punkte stehen hier noch als **eine** Liste — das Clustern nach Bereichen
 * (Feedback-Runde 1, Punkt 7) ist F2 und kommt im nächsten Schritt; F1 bringt
 * nur die Seitenleiste.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireArea("admin");
  const { t } = await getI18n();

  const items = [
    { href: "/admin", label: t.admin.nav.overview },
    { href: "/admin/programm", label: t.admin.nav.programme },
    { href: "/admin/bewerbungen", label: t.admin.nav.applications },
    { href: "/admin/partner", label: t.admin.nav.partners },
    { href: "/admin/volunteers", label: t.admin.nav.volunteers },
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
    <SidebarShell
      area="admin"
      label={t.areas.admin.portal}
      rootHref="/admin"
      groups={[{ label: "", items }]}
    >
      {children}
    </SidebarShell>
  );
}
