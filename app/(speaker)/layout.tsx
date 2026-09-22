import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SidebarShell } from "@/components/layout/SidebarShell";
import type { SpeakerProfile } from "./speaker/types";

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

  // Wer keine Reisekosten erstattet bekommt, sieht den Punkt gar nicht erst
  // (SPK-031). Eine Seite, die nur sagt „das gilt nicht für dich", weckt
  // Erwartungen und beantwortet keine Frage. Die Seite selbst prüft es noch
  // einmal — ein Menü ist keine Rechtegrenze.
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("my_speaker_profile");
  const profile = (data ?? null) as SpeakerProfile | null;
  const zeigeReisekosten = profile?.travel_costs_covered === true;

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
            ...(zeigeReisekosten
              ? [{ href: "/speaker/reisekosten", label: t.speaker.navExpenses }]
              : []),
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
