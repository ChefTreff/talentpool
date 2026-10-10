import { SectionTabs } from "@/components/layout/SectionTabs";
import { getI18n } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/shared";
import { reiterMitZahl, type FreigabeZaehler } from "@/lib/freigaben";
import { ladeFreigabeZaehler } from "@/lib/freigaben-server";

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
  // ADM-070: der Reiter „Freigabe“ trägt die Zahl der wartenden Slots — derselbe Wert wie am Menüpunkt „Freigaben“ (`freigabe_zaehler().slots`), je Anfrage einmal
  // geladen. Nur mit dem Reiter: das Leads-Board hat ihn nicht und fragt nichts. Fehlt die Zahl, bleibt der Reiter, wie er war.
  const zaehler: FreigabeZaehler = withRelease ? await ladeFreigabeZaehler() : {};
  return (
    <SectionTabs
      label={t.admin.programme.title}
      items={[
        { href: basePath, label: t.admin.programmeTable.tabBoard, exact: true },
        { href: `${basePath}/tabelle`, label: t.admin.programmeTable.tabTable },
        // ADM-072: die Freigabe der Slots steht in der zentralen Freigabe-Übersicht.
        ...(withRelease
          ? [{ href: "/admin/einreichungen?art=slots", label: reiterMitZahl(t.admin.programmeRelease.tab, zaehler.slots), aktiv: false }]
          : []),
      ]}
    />
  );
}
