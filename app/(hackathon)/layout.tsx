import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { SidebarShell } from "@/components/layout/SidebarShell";

export const dynamic = "force-dynamic";

/**
 * Hackathon-Portal. Bereichs-Gate: ohne Login → /login?next=…, ohne Rolle → 404.
 * Englisch ist die Ausgangssprache (Arbeitsauftrag B7, Entscheidung E7).
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
      groups={[
        {
          label: "",
          items: [
            { href: "/hackathon", label: t.hackathon.navOverview },
            { href: "/hackathon/challenges", label: t.hackathon.navChallenges },
            { href: "/hackathon/schedule", label: t.hackathon.navSchedule },
            // Bewertung und Teams beantworten die RPCs für Unbefugte mit 42501;
            // die Seiten werden dann zu 404. Die Punkte hier zu verstecken
            // hiesse, die Rollen zweimal zu pflegen — einmal in SQL, einmal im
            // Menü. Eine davon wäre irgendwann falsch.
            { href: "/hackathon/judging", label: t.hackathon.navJudging },
            { href: "/hackathon/teams", label: t.hackathon.navTeams },
          ],
        },
      ]}
    >
      {children}
    </SidebarShell>
  );
}
