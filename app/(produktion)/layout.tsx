import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { SidebarShell } from "@/components/layout/SidebarShell";

export const dynamic = "force-dynamic";

/**
 * Produktions-Portal. Bereichs-Gate: ohne Login → /login?next=…, ohne Rolle → 404.
 * Regie, Stände und Bestellungen (PR 25). Die Reiter in der Seite
 * wiederholen dieselben drei Punkte — die Leiste führt hinein, die Reiter
 * halten den Zusammenhang, wenn jemand über einen Link direkt landet.
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
      groups={[
        {
          label: "",
          items: [
            { href: "/produktion", label: t.production.tabRegie },
            { href: "/produktion/staende", label: t.production.tabBooths },
            { href: "/produktion/bestellungen", label: t.production.tabSuppliers },
          ],
        },
      ]}
    >
      {children}
    </SidebarShell>
  );
}
