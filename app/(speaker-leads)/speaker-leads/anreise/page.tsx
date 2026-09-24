import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { TravelList, type TravelRow } from "@/components/speaker/TravelList";

export const dynamic = "force-dynamic";

/**
 * Wer kommt wann — für die Speaker, die dieser Lead-Person zugeordnet sind.
 *
 * Die Einschränkung macht die Datenbank (`can_manage_speaker` in
 * `speaker_travel_list`), nicht diese Seite. Deshalb ist es dieselbe
 * Komponente wie im Admin-Bereich: eine Liste, zwei Reichweiten.
 */
export default async function LeadsTravelPage() {
  await requireArea("speaker-leads", "/speaker-leads/anreise");
  const { locale, t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const [{ data: rows }, vocab] = await Promise.all([
    supabase.rpc("speaker_travel_list"),
    loadVocabMap(supabase, locale),
  ]);

  return (
    <>
      <PageHeader word={t.leads.wordJourney} title={t.travelList.title} description={t.travelList.leadLead} />
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
