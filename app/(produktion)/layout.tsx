import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { SidebarShell } from "@/components/layout/SidebarShell";

export const dynamic = "force-dynamic";

/**
 * Produktions-Portal. Bereichs-Gate: ohne Login → /login?next=…, ohne Rolle → 404.
 * Die Seitenleiste trägt bis zu PR 25 nur den Einstieg.
 */
export default async function ProduktionLayout({ children }: { children: ReactNode }) {
  await requireArea("produktion");
  const { t } = await getI18n("de");

  return (
    <SidebarShell
      area="produktion"
      label={t.areas.produktion.portal}
      rootHref="/produktion"
      locale="de"
      groups={[{ label: "", items: [{ href: "/produktion", label: t.common.overview }] }]}
    >
      {children}
    </SidebarShell>
  );
}
