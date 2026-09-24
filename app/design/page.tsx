import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n";
import { AppHeader } from "@/components/layout/AppHeader";
import { PageHeader } from "@/components/ui/PageHeader";
import { KitSchau } from "@/components/ui/KitSchau";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Die Schau des Design-Systems: alle Bausteine mit Beispielinhalten.
 *
 * **Keine Rollenprüfung, aber auch keine Daten.** Die Seite liest nichts aus
 * der Datenbank und zeigt ausschließlich erfundene Beispiele; jede
 * angemeldete Person darf sie sehen. Das Login-Gate des Proxys gilt trotzdem
 * — sie steht nicht in `PUBLIC_PATHS`, und das soll so bleiben: eine
 * öffentlich erreichbare Seite wäre eine Änderung an einer Sicherheitsgrenze,
 * und dafür ist die Architektur-Session zuständig.
 *
 * Wozu es sie gibt: Ein Baustein lässt sich nicht beurteilen, solange er in
 * einer Seite steckt, für die man erst die passenden Daten und die passende
 * Rolle braucht. Konrad sieht hier alles auf einmal, die Build-Chats sehen,
 * was es schon gibt, bevor sie etwas nachbauen.
 */
export default async function DesignSystemPage() {
  const { t } = await getI18n();
  return (
    <>
      <AppHeader />
      <main id="content" className="flex-1">
        <div className="mx-auto w-full max-w-content px-4 pt-8 sm:px-6">
          <PageHeader title={t.kit.title} description={t.kit.lead} />
        </div>
        <KitSchau t={t.kit} />
      </main>
    </>
  );
}
