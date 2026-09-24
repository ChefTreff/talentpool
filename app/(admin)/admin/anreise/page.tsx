import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { TravelList, type TravelRow } from "@/components/speaker/TravelList";

export const dynamic = "force-dynamic";

/**
 * Die vollständige Ankunftsliste. Dieselbe Komponente wie im Lead-Portal —
 * nur sieht das Team hier alle Speaker, weil `can_manage_speaker` für die
 * Bereichsleitung jeden einschliesst.
 */
export default async function AdminTravelPage() {
  await requireAdminSection("travel", "/admin/anreise");
  const { locale, t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const [{ data: rows }, vocab] = await Promise.all([
    supabase.rpc("speaker_travel_list"),
    loadVocabMap(supabase, locale),
  ]);

  return (
    <>
      <PageHeader title={t.travelList.title} description={t.travelList.adminLead} />
      <TravelList
        rows={(rows ?? []) as TravelRow[]}
        modes={vgroup(vocab, "travel_mode")}
        pipelineLabels={vgroup(vocab, "speaker_pipeline")}
        dateLocale={t.meta.dateLocale}
        t={t.travelList}
        common={{ choose: t.common.choose, none: t.common.none }}
      />
    </>
  );
}
