import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadActiveKeys, loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ZuordnungView, type Uebersicht } from "./ZuordnungView";

export const dynamic = "force-dynamic";

/**
 * Tour-Zuordnung (ADM-045, Konrad 22.09.: „Company Tours sind Operations, nicht
 * Verkauf"). Verkauft wird ein allgemeiner Slot; hier legt das Team fest, welcher
 * Partner auf welcher Tour steht, und tauscht. Die Touren selbst (Tag, Zeiten,
 * Tour Lead, Bewerbungs-Session) pflegt /admin/company-tours.
 */
export default async function TourZuordnungPage() {
  await requireAdminSection("tourAssignment", "/admin/company-tours/zuordnung");
  const { t, locale } = await getI18n();
  const z = t.tourAssignment as Record<string, string>;
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, vocab, aktiv] = await Promise.all([
    supabase.rpc("tour_assignment_admin"),
    loadVocabMap(supabase, locale),
    loadActiveKeys(supabase, "company_tour_type"),
  ]);
  const typen = Object.entries(vgroup(vocab, "company_tour_type"))
    .filter(([k]) => aktiv.has(k))
    .map(([value, label]) => ({ value, label }));

  return (
    <>
      <PageHeader word={t.admin.words.companyTours} title={z.title} description={z.lead} />
      {error || !data ? (
        <EmptyState title={z.errorTitle} description={z.errorBody} />
      ) : (
        <ZuordnungView
          daten={data as Uebersicht}
          typen={typen}
          dateLocale={t.meta.dateLocale}
          t={z}
          common={{ none: t.common.none, cancel: t.common.cancel }}
          rpcMessages={t.rpc as Record<string, string>}
        />
      )}
    </>
  );
}
