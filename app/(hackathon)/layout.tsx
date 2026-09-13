import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { SidebarShell } from "@/components/layout/SidebarShell";

export const dynamic = "force-dynamic";

/**
 * Hackathon-Portal. Bereichs-Gate: ohne Login → /login?next=…, ohne Rolle → 404.
 * Englisch ist die Ausgangssprache (Arbeitsauftrag B7). Die Seitenleiste trägt
 * bis zu PR 28 nur den Einstieg; die weiteren Punkte kommen mit den Seiten.
 */
export default async function HackathonLayout({ children }: { children: ReactNode }) {
  await requireArea("hackathon");
  const { t } = await getI18n("en");

  return (
    <SidebarShell
      area="hackathon"
      label={t.areas.hackathon.portal}
      rootHref="/hackathon"
      locale="en"
      groups={[{ label: "", items: [{ href: "/hackathon", label: t.common.overview }] }]}
    >
      {children}
    </SidebarShell>
  );
}
