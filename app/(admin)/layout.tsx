import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { ADMIN_SECTIONS, type AdminSectionKey } from "@/lib/admin-sections";
import { mayEnterAdminSection } from "@/lib/admin-access";
import { getI18n } from "@/lib/i18n";
import { SidebarShell, type SidebarGroup } from "@/components/layout/SidebarShell";
import { sichtbareNavigation, type NavZusatz } from "@/lib/admin-navigation";
import { FREIGABE_ARTEN, FREIGABE_PFAD, freigabeNavigation, type FreigabeArt } from "@/lib/freigaben";
import { ladeFreigabeZaehler } from "@/lib/freigaben-server";

/** Die Abschnitte, über die jemand eine Freigabe-Art entscheiden darf — hat er keinen, braucht es keinen Zähler. */
const FREIGABE_ABSCHNITTE = ["submissions", "programme", "expenses", "hospitality"] as const;

export const dynamic = "force-dynamic";

/**
 * Admin/Manager: Desktop-first, dichte Tabellen.
 * `requireArea("admin")` prüft serverseitig; der Proxy hat nur vorsortiert.
 *
 * **Sortiert nach Portal, nicht alphabetisch** (Feedback-Runde 1, Punkt 7):
 * Wer die Speaker betreut, findet Tickets, Reisekosten, Hotels und den
 * Technik-Check beieinander, statt sie aus sechzehn Punkten zu fischen. Was
 * für alle Bereiche gilt — Personen, Rollen, Fristen, Vokabular, Mail —
 * steht unter „System".
 *
 * Die dritte Ebene bleibt **in** der Seite: Partner und Volunteers führen ihre
 * Unterseiten als Reiter (`SectionTabs`). Sie hier zusätzlich aufzuzählen
 * hieße, dieselben Links zweimal zu pflegen; die Seitenleiste nennt deshalb
 * das Ziel und nicht jede Abzweigung.
 *
 * Seit PORT1 (Konrad, 22.09.2026) betritt **jede Teamrolle** den Bereich; die
 * Leiste zeigt dann nur die Abschnitte, die diese Rolle öffnet. Sichtbarkeit und
 * Zugang kommen aus derselben Quelle (`lib/admin-sections.ts`) — eine Navigation,
 * die auf etwas zeigt, das hinterher 404 gibt, ist schlimmer als keine.
 *
 * Die Produktion ist mit PORT2 hierher gezogen (`/admin/produktion`); ihre
 * Reiter bleiben in der Seite, wie bei Partner und Volunteers.
 *
 * Die Liste selbst steht seit QS-032 in `lib/admin-navigation.ts` — die
 * Rollenverwaltung zeigt mit derselben Liste, was eine Rolle sähe.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { roleNames } = await requireArea("admin");
  const { t } = await getI18n();
  const nav = t.admin.nav;

  // Einmal fragen statt je Punkt: die Ausnahmen liegen nach dem ersten Aufruf
  // im Anfrage-Cache, aber die Prüfung ist asynchron und lässt sich in der
  // Liste unten nicht abwarten.
  const offen = new Set<AdminSectionKey>(
    (
      await Promise.all(
        ADMIN_SECTIONS.map(async (s) => ((await mayEnterAdminSection(s.key, roleNames)) ? s.key : null)),
      )
    ).filter((k): k is AdminSectionKey => k !== null),
  );

  // ADM-080/081: wartende Freigaben im Menü — die Summe am Punkt „Freigaben“, darunter je Art, die die Person
  // entscheiden darf, ein Unterpunkt mit eigener Zahl. Ein Aufruf, der selbst nur ihre Arten zählt; fehlt er oder
  // scheitert er, bleibt die Leiste, wie sie war. Nach einer Aktion auf der Seite aktualisiert `router.refresh()`
  // auch die Leiste (Layouts gehören zum Baum, den es neu holt).
  const zusatz: Record<string, NavZusatz> = {};
  if (FREIGABE_ABSCHNITTE.some((k) => offen.has(k))) {
    const freigaben = freigabeNavigation(await ladeFreigabeZaehler(), {
      tab: Object.fromEntries(
        FREIGABE_ARTEN.map((a) => [a, t.adminApprovals[`tab_${a}` as const]]),
      ) as Record<FreigabeArt, string>,
      offen: t.adminApprovals.openCount,
    });
    if (freigaben) zusatz[FREIGABE_PFAD] = freigaben;
  }

  const groups: SidebarGroup[] = sichtbareNavigation((k) => offen.has(k), nav, zusatz);

  return (
    <SidebarShell area="admin" label={t.areas.admin.portal} rootHref="/admin" groups={groups}>
      {children}
    </SidebarShell>
  );
}
