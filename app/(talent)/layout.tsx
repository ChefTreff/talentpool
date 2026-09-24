import type { ReactNode } from "react";
import { requireArea } from "@/lib/auth";
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
 * **Seit 24.09.2026 immer ein eigenes Portal** (TAL-004, Konrad: „unser
 * wichtigstes Portal, das darf nicht sein"). Vorher zeigte das Layout diese
 * Seiten für Personen mit Fachbereich in dessen Shell — oben blieb
 * „Speaker-Portal" ausgewählt, der erste Punkt führte dorthin zurück
 * (Entscheidung 13.09., Runde 1, Punkt 2: „keine Spur eines fremden
 * Bereichs"). Das ist aufgehoben: das Teilnehmer-Portal ist das Front-End des
 * Talent-CRM und steht als eigener Eintrag im Umschalter neben den anderen.
 * Der Einstieg nach dem Login bleibt im Fachbereich (`landingPathFor`).
 *
 * **Seit 24.09.2026 zwei Ebenen** (TAL-005, D11): „Home" (`/start`) ist die
 * allgemeine Startseite, der Summit ist eine Seitengruppe mit eigener
 * Startseite (`/summit`).
 */
export default async function TalentLayout({ children }: { children: ReactNode }) {
  await requireArea("talent");
  const { t } = await getI18n();

  // D11 (Konrad 24.09.): Seitengruppen statt Unterportal. Oben das
  // allgemeine „Home" und das Profil, darunter je Format eine Gruppe — zuerst
  // der Summit; Community-Events und Bootcamp folgen als eigene Gruppen.
  const allgemein: SidebarGroup = {
    label: "",
    items: [
      { href: "/start", label: t.talentHome.navLabel },
      { href: "/profil", label: t.profile.title },
    ],
  };
  const summit: SidebarGroup = {
    label: t.talentSummit.groupLabel,
    items: [
      { href: "/summit", label: t.talentSummit.navLabel },
      { href: "/programm", label: t.programme.title },
      { href: "/meine", label: t.participation.title },
    ],
  };

  return (
    <SidebarShell
      area="talent"
      label={t.areas.talent.portal}
      rootHref="/start"
      groups={[allgemein, summit]}
    >
      {children}
    </SidebarShell>
  );
}
