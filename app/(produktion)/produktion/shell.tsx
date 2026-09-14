import { SectionTabs } from "@/components/layout/SectionTabs";
import { getI18n } from "@/lib/i18n";

/** Reiter der Produktion: Regie, Stände, Bestellungen, Dateien. */
export async function ProductionTabs() {
  const { t } = await getI18n("de");
  return (
    <SectionTabs
      label={t.production.title}
      items={[
        { href: "/produktion", label: t.production.tabRegie, exact: true },
        { href: "/produktion/staende", label: t.production.tabBooths },
        { href: "/produktion/bestellungen", label: t.production.tabSuppliers },
        { href: "/produktion/dateien", label: t.production.tabFiles },
      ]}
    />
  );
}
