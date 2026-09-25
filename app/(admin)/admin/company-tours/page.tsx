import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { CompanyTours, type AdminTour, type Optionen } from "./CompanyTours";

export const dynamic = "force-dynamic";

/**
 * Company Tours (ADM-058, K-31). Gebucht wird ein allgemeiner Slot; **welche**
 * Tour, welche Stopps und welche Session daran hängt, legt das Team hier fest —
 * Konrad, 24.09.2026: „Das ist dann ja nicht mehr Verkauf sondern Operations."
 *
 * Bis hierher gab es die Funktionen (`company_tours_admin`, `upsert_company_tour`)
 * schon, aber keine Oberfläche dazu — und das Programm-Team kam wegen ADM-052
 * gar nicht an sie heran.
 */
export default async function CompanyToursPage() {
  await requireAdminSection("companyTours", "/admin/company-tours");
  const { t } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const [touren, optionen] = await Promise.all([
    supabase.rpc("company_tours_admin"),
    supabase.rpc("company_tour_options"),
  ]);

  return (
    <>
      <PageHeader word={t.admin.words.companyTours} title={t.companyTours.title} description={t.companyTours.lead} />
      <CompanyTours
        touren={(touren.data ?? []) as AdminTour[]}
        optionen={(optionen.data ?? { edition_id: null, days: [], leads: [], sessions: [], orgs: [] }) as Optionen}
        t={t.companyTours}
        common={{ save: t.common.save, cancel: t.common.cancel, close: t.common.close }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
