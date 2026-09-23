import type { ReactNode } from "react";
import { getMyAreas, requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { SidebarShell, type SidebarGroup } from "@/components/layout/SidebarShell";

export const dynamic = "force-dynamic";

/**
 * Teilnehmer-Portal: Übersicht, Programm, Anmeldungen, Profil. Offen für
 * **jede** angemeldete Person — die Tür entscheidet `requireArea`, nicht die
 * Rolle.
 *
 * **Seit 22.09.2026 beginnt das Portal auf `/start`** (Konrad), einer
 * Menüseite. Vorher begann es auf `/profil`: wer sich anmeldete, landete in
 * einem Formular und musste raten, dass es daneben Programm und Anmeldungen
 * gibt. Das korrigiert die Entscheidung F8.4 („keine eigene Übersicht"), die
 * aus einer Zeit stammt, in der es die Übersicht noch nicht gab.
 *
 * Wer einen Fachbereich hat, sieht diese Seiten als Teil **seines** Portals:
 * oben steht weiter „CHEFTREFF SPEAKER-PORTAL", und der erste Punkt führt
 * dorthin zurück. So gibt es auf dem Weg zum Profil keine Spur eines fremden
 * Bereichs (Feedback-Runde 1, Punkt 2; Konrads Entscheidung 13.09.).
 */
export default async function TalentLayout({ children }: { children: ReactNode }) {
  await requireArea("talent");
  const { t } = await getI18n();
  const areas = await getMyAreas();
  // `areasFor` liefert das Teilnehmer-Portal nur, wenn es das einzige ist.
  const home = areas.find((a) => a.key !== "talent") ?? null;

  const mine: SidebarGroup = {
    label: home ? t.nav.account : "",
    items: [
      { href: "/start", label: t.talentStart.navLabel },
      { href: "/programm", label: t.programme.title },
      { href: "/meine", label: t.participation.title },
      { href: "/profil", label: t.profile.title },
    ],
  };

  if (!home) {
    return (
      <SidebarShell
        area="talent"
        label={t.areas.talent.portal}
        rootHref="/start"
        groups={[mine]}
      >
        {children}
      </SidebarShell>
    );
  }

  return (
    <SidebarShell
      area={home.key}
      label={t.areas[home.key].portal}
      rootHref={home.path}
      groups={[
        { label: "", items: [{ href: home.path, label: t.areas[home.key].portal }] },
        mine,
      ]}
    >
      {children}
    </SidebarShell>
  );
}
