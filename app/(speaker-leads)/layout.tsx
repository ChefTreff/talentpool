import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { SidebarShell } from "@/components/layout/SidebarShell";

export const dynamic = "force-dynamic";

/**
 * Speaker-Leads: Rolle `speaker_manager` (plus Team). Deutsch zuerst — das
 * Lead-Portal ist ein internes Werkzeug, kein Gastbereich; deshalb hier kein
 * Sprach-Fallback wie im Speaker-Portal.
 */
export default async function SpeakerLeadsLayout({ children }: { children: ReactNode }) {
  await requireArea("speaker-leads");
  const { t } = await getI18n("de");

  return (
    <SidebarShell
      area="speaker-leads"
      label={t.areas["speaker-leads"].portal}
      rootHref="/speaker-leads"
      locale="de"
      groups={[
        {
          label: "",
          items: [
            // Übersicht als Startseite wie in den anderen Portalen (LEAD-024);
            // die Pipeline steht seitdem unter /speaker-leads/pipeline.
            { href: "/speaker-leads", label: t.leads.navOverview },
            { href: "/speaker-leads/pipeline", label: t.leads.navPipeline },
            { href: "/speaker-leads/bestaetigt", label: t.leads.navConfirmed },
            { href: "/speaker-leads/anreise", label: t.leads.navTravel },
            { href: "/speaker-leads/shuttle", label: t.leads.navShuttle },
            { href: "/speaker-leads/regie", label: t.leads.navRegie },
            { href: "/speaker-leads/praesentationen", label: t.leads.navPresentations },
            { href: "/speaker-leads/board", label: t.leads.navBoard },
            { href: "/speaker-leads/einreichungen", label: t.leads.navSubmissions },
          ],
        },
      ]}
    >
      {children}
    </SidebarShell>
  );
}
