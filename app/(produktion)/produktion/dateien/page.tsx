import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductionTabs } from "../shell";
import { loadAxes } from "../load";
import { DateienView, type EditionFileRow } from "./DateienView";

export const dynamic = "force-dynamic";

/**
 * Editionsdateien (F10): Hallenplan, Anfahrt, Aufbauplan.
 *
 * Sie stehen hier und nicht im Admin, weil sie hier entstehen — Konrad:
 * „Der Hallenplan sollte ein im Produktions-Bereich hinzugefügtes PDF oder
 * Bild sein." Wer sie sieht, entscheidet die Zielgruppe am Eintrag.
 */
export default async function EditionFilesPage() {
  await requireArea("produktion", "/produktion/dateien");
  const { locale, t } = await getI18n("de");
  const axes = await loadAxes();

  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, vocab] = await Promise.all([
    supabase.rpc("edition_files_admin", { p_edition_id: axes.editionId }),
    loadVocabMap(supabase, locale),
  ]);

  return (
    <>
      <PageHeader title={t.productionFiles.title} description={t.productionFiles.lead} />
      <ProductionTabs />
      {!axes.editionId ? (
        <EmptyState
          title={t.productionFiles.emptyTitle}
          description={t.productionFiles.emptyBody}
        />
      ) : (
        <DateienView
          editionId={axes.editionId}
          files={(rows ?? []) as EditionFileRow[]}
          kinds={vgroup(vocab, "edition_file_kind")}
          dateLocale={t.meta.dateLocale}
          t={t.productionFiles}
          common={{ cancel: t.common.cancel, delete: t.common.delete }}
        />
      )}
    </>
  );
}
