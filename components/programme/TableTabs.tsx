import { SectionTabs } from "@/components/layout/SectionTabs";
import { getI18n } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/shared";

/**
 * Umschalter zwischen Kalender und Tabelle. Zwei Sichten auf dieselben Daten:
 * das Board zeigt, was nebeneinander liegt, die Tabelle, was noch fehlt.
 *
 * Eigene Pfade statt eines Parameters, damit die Tabelle ein Lesezeichen
 * verträgt und die Reiter über `usePathname()` von selbst richtig stehen.
 */
export async function TableTabs({
  basePath,
  locale,
  withRelease,
}: {
  basePath: string;
  locale?: Locale;
  /**
   * Dritter Reiter „Freigabe" (LEAD-022) — nur im Admin. Im Leads-Board gibt
   * es nichts freizugeben: das darf nur die Programmleitung.
   */
  withRelease?: boolean;
}) {
  const { t } = await getI18n(locale);
  return (
    <SectionTabs
      label={t.admin.programme.title}
      items={[
        { href: basePath, label: t.admin.programmeTable.tabBoard, exact: true },
        { href: `${basePath}/tabelle`, label: t.admin.programmeTable.tabTable },
        ...(withRelease
          ? [{ href: `${basePath}/freigabe`, label: t.admin.programmeRelease.tab }]
          : []),
      ]}
    />
  );
}
