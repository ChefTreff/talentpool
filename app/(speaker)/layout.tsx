import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { SidebarShell } from "@/components/layout/SidebarShell";

export const dynamic = "force-dynamic";

/**
 * Speaker-Portal für `speaker` und `speaker_assistant`.
 *
 * Englisch ist die Ausgangssprache (Entscheidungslog 10.09.): `getI18n("en")`
 * greift nur, wenn die Person keine Sprache gewählt hat — Profilsprache und
 * Umschalter gewinnen immer.
 */
export default async function SpeakerLayout({ children }: { children: ReactNode }) {
  await requireArea("speaker");
  const { t } = await getI18n("en");

  return (
    <SidebarShell
      area="speaker"
      label={t.areas.speaker.portal}
      rootHref="/speaker"
      locale="en"
      groups={[
        {
          label: "",
          items: [
            { href: "/speaker", label: t.speaker.navOverview },
            { href: "/speaker/session", label: t.speaker.navSession },
            { href: "/speaker/travel", label: t.speaker.navTravel },
            { href: "/speaker/tickets", label: t.speaker.navTickets },
            { href: "/speaker/reisekosten", label: t.speaker.navExpenses },
            { href: "/speaker/media", label: t.speaker.navMedia },
            { href: "/speaker/grafik", label: t.speaker.navGraphic },
            { href: "/speaker/profil", label: t.speaker.navProfile },
            { href: "/speaker/wiki", label: t.speaker.navWiki },
          ],
        },
      ]}
    >
      {children}
    </SidebarShell>
  );
}
