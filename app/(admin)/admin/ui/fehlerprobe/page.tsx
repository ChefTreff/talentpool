import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { FehlerProbe } from "./FehlerProbe";

export const dynamic = "force-dynamic";

/**
 * Fehlerprobe (QS-023): Die Fehlergrenze erscheint nur, wenn etwas ausfällt —
 * ohne Probe könnte Konrad sie nicht abnehmen. Beide Wege werfen absichtlich
 * und tragen ein erfundenes Serverdetail im Text. Auf der Fehlerseite darf
 * davon nichts stehen, nur die Fehler-ID:
 *
 *   * **Server** (`?art=server`): Die Seite wirft beim Rendern. Next schickt
 *     in Produktion nur eine allgemeine Meldung mit `digest`; die ID auf der
 *     Fehlerseite findet man in den Vercel-Logs wieder.
 *   * **Browser** (`FehlerProbe`): Die Komponente wirft beim Rendern im
 *     Browser. Hier kommt die Meldung ungekürzt bei der Grenze an — genau
 *     der Fall, den `fehlerId` abfängt.
 *
 * Nichts wird geschrieben; das Gate ist das der Bausteinschau.
 */
export default async function FehlerProbePage({
  searchParams,
}: {
  searchParams: Promise<{ art?: string }>;
}) {
  await requireAdminSection("ui", "/admin/ui/fehlerprobe");
  const { art } = await searchParams;
  if (art === "server") {
    throw new Error(
      'Fehlerprobe auf dem Server: relation "zz_geheim" does not exist (erfundenes Serverdetail)',
    );
  }

  const { t } = await getI18n();
  return (
    <>
      <PageHeader
        word={t.admin.words.ui}
        title={t.admin.ui.errorProbeTitle}
        description={t.admin.ui.errorProbeLead}
      />
      <FehlerProbe
        serverHref="/admin/ui/fehlerprobe?art=server"
        t={{ server: t.admin.ui.errorProbeServer, browser: t.admin.ui.errorProbeBrowser }}
      />
    </>
  );
}
