import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
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
 * Hackathon und Produktion haben noch keine Admin-Seite — ihre Abschnitte
 * kommen mit PR 25 und PR 28 dazu.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireArea("admin");
  const { t } = await getI18n();
  const nav = t.admin.nav;

  const groups: SidebarGroup[] = [
    { label: "", items: [{ href: "/admin", label: nav.overview }] },
    {
      label: nav.sections.participants,
      items: [
        { href: "/admin/bewerbungen", label: nav.applications },
        { href: "/admin/programm", label: nav.programme },
      ],
    },
    {
      label: nav.sections.speaker,
      items: [
        // Der Einstieg in die Domäne steht oben: von hier aus geht es zu jedem
        // einzelnen Speaker, die Listen darunter beantworten Einzelfragen.
        { href: "/admin/speaker", label: nav.speakers },
        { href: "/admin/speaker-leads", label: nav.speakerLeads },
        { href: "/admin/speaker-tickets", label: nav.speakerTickets },
        { href: "/admin/reisekosten", label: nav.expenses },
        { href: "/admin/hospitality", label: nav.hospitality },
        { href: "/admin/anreise", label: nav.travel },
        { href: "/admin/technik", label: nav.tech },
      ],
    },
    {
      label: nav.sections.partner,
      items: [{ href: "/admin/partner", label: nav.partnerCare }],
    },
    {
      label: nav.sections.volunteers,
      items: [{ href: "/admin/volunteers", label: nav.volunteersWork }],
    },
    // Catering steht für sich: es betrifft Speaker **und** Volunteers, und die
    // Zahlen sind bewusst ohne Personenbezug (Migration 0100).
    {
      label: nav.sections.crossCutting,
      items: [{ href: "/admin/catering", label: nav.catering }],
    },
    {
      label: nav.sections.system,
      items: [
        { href: "/admin/personen", label: nav.persons },
        // Das Team zuerst: „wer gehoert dazu" ist die Frage, mit der man
        // herkommt; die Rollenverwaltung darunter ist das Werkzeug fuer
        // jede einzelne Zuweisung, auch ausserhalb des Teams.
        { href: "/admin/team", label: nav.team },
        { href: "/admin/rollen", label: nav.roles },
        { href: "/admin/fristen", label: nav.deadlines },
        { href: "/admin/ansprechpartner", label: nav.contacts },
        { href: "/admin/vokabular", label: nav.vocab },
        { href: "/admin/dubletten", label: nav.duplicates },
        { href: "/admin/mail", label: nav.mail },
        { href: "/admin/wiki", label: nav.wiki },
        { href: "/admin/videos", label: nav.videos },
        { href: "/admin/ui", label: nav.ui },
      ],
    },
  ];

  return (
    <SidebarShell area="admin" label={t.areas.admin.portal} rootHref="/admin" groups={groups}>
      {children}
    </SidebarShell>
  );
}
