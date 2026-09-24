import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { canEnterAdminSection, type AdminSectionKey } from "@/lib/admin-sections";
import { getI18n } from "@/lib/i18n";
import { SidebarShell, type SidebarGroup } from "@/components/layout/SidebarShell";

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
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { roleNames } = await requireArea("admin");
  const { t } = await getI18n();
  const nav = t.admin.nav;

  /** Ein Punkt der Leiste, der nur erscheint, wenn die Rolle den Abschnitt öffnet. */
  const eintrag = (section: AdminSectionKey, href: string, label: string) =>
    canEnterAdminSection(section, roleNames) ? [{ href, label }] : [];

  const alleGruppen: SidebarGroup[] = [
    { label: "", items: eintrag("overview", "/admin", nav.overview) },
    {
      label: nav.sections.participants,
      items: [
        ...eintrag("applications", "/admin/bewerbungen", nav.applications),
        ...eintrag("programme", "/admin/programm", nav.programme),
        // Das Geruest steht neben dem Programm, nicht unter System: wer
        // eine Buehne anlegt, kommt vom Board und will dorthin zurueck.
        ...eintrag("edition", "/admin/edition", nav.edition),
      ],
    },
    {
      label: nav.sections.speaker,
      items: [
        // Der Einstieg in die Domäne steht oben: von hier aus geht es zu jedem
        // einzelnen Speaker, die Listen darunter beantworten Einzelfragen.
        ...eintrag("speakers", "/admin/speaker", nav.speakers),
        ...eintrag("speakers", "/admin/speaker/aufgaben", nav.speakerTasks),
        ...eintrag("speakerLeads", "/admin/speaker-leads", nav.speakerLeads),
        ...eintrag("speakerTickets", "/admin/speaker-tickets", nav.speakerTickets),
        ...eintrag("expenses", "/admin/reisekosten", nav.expenses),
        ...eintrag("hospitality", "/admin/hospitality", nav.hospitality),
        ...eintrag("reception", "/admin/reception", nav.reception),
        ...eintrag("travel", "/admin/anreise", nav.travel),
        // Beides hing bisher nur im Lead-Portal. Seit der Regel
        // „Admin-Vollständigkeit" (22.09.) gibt es jeden Team-Weg auch hier —
        // dieselbe Seite, nur ein anderes Bereichsgate.
        ...eintrag("submissions", "/admin/einreichungen", nav.submissions),
        ...eintrag("regie", "/admin/regie", nav.regie),
        ...eintrag("tech", "/admin/technik", nav.tech),
        ...eintrag("graphics", "/admin/grafiken", nav.graphics),
      ],
    },
    {
      label: nav.sections.partner,
      items: [
        ...eintrag("partner", "/admin/partner", nav.partnerCare),
        ...eintrag("initiatives", "/admin/initiativen", nav.initiatives),
      ],
    },
    {
      label: nav.sections.volunteers,
      items: eintrag("volunteers", "/admin/volunteers", nav.volunteersWork),
    },
    // Produktion (PORT2): war bis zum 22.09.2026 ein eigenes Portal unter
    // `/produktion`. Die Reiter Regie, Stände, Bestellungen, Catering und
    // Dateien bleiben in der Seite.
    {
      label: nav.sections.production,
      items: eintrag("production", "/admin/produktion", nav.production),
    },
    // Catering steht für sich: es betrifft Speaker **und** Volunteers, und die
    // Zahlen sind bewusst ohne Personenbezug (Migration 0100).
    {
      label: nav.sections.crossCutting,
      items: eintrag("catering", "/admin/catering", nav.catering),
    },
    {
      label: nav.sections.system,
      items: [
        ...eintrag("persons", "/admin/personen", nav.persons),
        // Das Team zuerst: „wer gehoert dazu" ist die Frage, mit der man
        // herkommt; die Rollenverwaltung darunter ist das Werkzeug fuer
        // jede einzelne Zuweisung, auch ausserhalb des Teams.
        ...eintrag("team", "/admin/team", nav.team),
        ...eintrag("roles", "/admin/rollen", nav.roles),
        ...eintrag("deadlines", "/admin/fristen", nav.deadlines),
        ...eintrag("contacts", "/admin/ansprechpartner", nav.contacts),
        ...eintrag("vocab", "/admin/vokabular", nav.vocab),
        ...eintrag("duplicates", "/admin/dubletten", nav.duplicates),
        ...eintrag("deletions", "/admin/loeschantraege", nav.deletions),
        ...eintrag("mail", "/admin/mail", nav.mail),
        ...eintrag("wiki", "/admin/wiki", nav.wiki),
        ...eintrag("videos", "/admin/videos", nav.videos),
        ...eintrag("ui", "/admin/ui", nav.ui),
      ],
    },
  ];

  // Eine Gruppe ohne sichtbaren Punkt verschwindet mit — sonst stünde bei einem
  // Produktionsmitglied eine leere Überschrift „Speaker" in der Leiste.
  const groups = alleGruppen.filter((g) => g.items.length > 0);

  return (
    <SidebarShell area="admin" label={t.areas.admin.portal} rootHref="/admin" groups={groups}>
      {children}
    </SidebarShell>
  );
}
