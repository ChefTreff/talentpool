import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { CateringView } from "@/components/catering/CateringView";
import { loadCatering } from "@/components/catering/load";
import { ProductionTabs } from "../shell";
import { loadAxes } from "../load";

export const dynamic = "force-dynamic";

/**
 * Die Bestellgrundlage fürs Catering — Zahlen und Hinweise, **ohne Namen**.
 *
 * Die Datenbank gibt gar nichts anderes her (Migration 0100): der Freitext
 * kann eine Gesundheitsangabe sein, und es gibt keine RPC, die ihn mit einer
 * Person zusammenbringt.
 */
export default async function ProductionCateringPage() {
  await requireAdminSection("production", "/admin/produktion/catering");
  const { locale, t } = await getI18n("de");
  const axes = await loadAxes();

  const supabase = await createSupabaseServerClient();
  const [daten, vocab] = await Promise.all([
    loadCatering(axes.editionId),
    loadVocabMap(supabase, locale),
  ]);

  return (
    <>
      <PageHeader word={t.admin.words.production} title={t.catering.title} description={t.catering.productionLead} />
      <ProductionTabs />
      <CateringView
        summary={daten.summary}
        notes={daten.notes}
        coverage={daten.coverage}
        dietLabels={vgroup(vocab, "diet")}
        audienceLabels={{ speaker: t.catering.groupSpeaker, volunteer: t.catering.groupVolunteer }}
        t={t.catering}
      />
    </>
  );
}
