import { SectionTabs } from "@/components/layout/SectionTabs";
import { getI18n } from "@/lib/i18n";

/** Reiter der Produktion: Regie, Stände, Bestellungen, Dateien. */
export async function ProductionTabs() {
  const { t } = await getI18n("de");
  return (
    <SectionTabs
      label={t.production.title}
      items={[
        { href: "/admin/produktion", label: t.production.tabRegie, exact: true },
        { href: "/admin/produktion/staende", label: t.production.tabBooths },
        { href: "/admin/produktion/bestellungen", label: t.production.tabSuppliers },
        { href: "/admin/produktion/catering", label: t.production.tabCatering },
        { href: "/admin/produktion/dateien", label: t.production.tabFiles },
      ]}
    />
  );
}
