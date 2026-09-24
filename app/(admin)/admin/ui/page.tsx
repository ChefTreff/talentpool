import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { KitSchau } from "@/components/ui/KitSchau";

export const dynamic = "force-dynamic";

/**
 * Die Bausteinschau im Admin-Bereich.
 *
 * Sie zeigt jetzt **dieselbe** Schau wie `/design`. Vorher stand hier eine
 * zweite, eigene Demo mit dem alten Kit — zwei Referenzseiten nebeneinander,
 * und wer in die falsche sah, baute mit Bausteinen weiter, die es so nicht
 * mehr gibt. Eine Referenz, zwei Wege dorthin: `/design` für alle
 * Angemeldeten, dieser Weg über die Admin-Navigation.
 */
export default async function UiKitPage() {
  // Gate je Seite, nicht nur im Layout: Layouts rendern bei Client-Navigation nicht neu.
  await requireAdminSection("ui", "/admin/ui");
  const { t } = await getI18n();

  return (
    <>
      <PageHeader title={t.admin.ui.title} description={t.admin.ui.lead} />
      <KitSchau t={t.kit} />
    </>
  );
}
