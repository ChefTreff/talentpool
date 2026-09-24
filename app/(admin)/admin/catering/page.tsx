import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { CateringView } from "@/components/catering/CateringView";
import { loadCatering } from "@/components/catering/load";

export const dynamic = "force-dynamic";

/**
 * Catering im Admin: dieselben Zahlen wie in der Produktion, dazu die Frage,
 * die nur hier zählt — wie viele haben überhaupt geantwortet. Daran hängt, ob
 * man noch erinnern muss.
 */
export default async function AdminCateringPage() {
  await requireAdminSection("catering", "/admin/catering");
  const { locale, t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const [{ data: editions }, vocab] = await Promise.all([
    supabase
      .from("event")
      .select("id")
      .eq("is_edition", true)
      .order("start_date", { ascending: false })
      .limit(1),
    loadVocabMap(supabase, locale),
  ]);
  const daten = await loadCatering(editions?.[0]?.id ?? null);

  return (
    <>
      <PageHeader title={t.catering.title} description={t.catering.adminLead} />
      <CateringView
        summary={daten.summary}
        notes={daten.notes}
        coverage={daten.coverage}
        dietLabels={vgroup(vocab, "diet")}
        audienceLabels={{ speaker: t.catering.groupSpeaker, volunteer: t.catering.groupVolunteer }}
        t={t.catering}
        showCoverage
      />
    </>
  );
}
