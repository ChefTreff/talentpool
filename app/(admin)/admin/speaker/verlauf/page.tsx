import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { VerlaufUebersicht, type UebersichtZeile } from "./VerlaufUebersicht";

export const dynamic = "force-dynamic";

/**
 * Der Verlauf aller Speaker der Edition (LEAD-025, Konrad 24.09.: „eine
 * Übersicht aller Kommentare im Speaker-Admin“) — Notizen, Kontakte und
 * Aufgaben, neuester zuerst. Nur fürs Team: `speaker_activity_overview` prüft
 * `is_speaker_team`; geschrieben wird im Speaker-Detail oder im Fenster der
 * Pipeline.
 */
export default async function SpeakerVerlaufPage() {
  await requireAdminSection("speakers", "/admin/speaker/verlauf");
  const { locale, t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const { data: edition } = await supabase
    .from("event")
    .select("id")
    .eq("is_edition", true)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: rows, error }, vocab] = await Promise.all([
    edition
      ? supabase.rpc("speaker_activity_overview", { p_edition_id: edition.id })
      : Promise.resolve({ data: [], error: null }),
    loadVocabMap(supabase, locale),
  ]);
  if (error) console.error("[admin/speaker/verlauf] speaker_activity_overview:", error.message);
  const zeilen = (rows ?? []) as UebersichtZeile[];

  return (
    <>
      <PageHeader
        word={t.admin.words.speakers}
        title={t.speakerVerlauf.overviewTitle}
        description={t.speakerVerlauf.overviewLead}
        actions={
          <ButtonLink href="/admin/speaker" variant="secondary" size="sm">
            {t.adminSpeaker.backToList}
          </ButtonLink>
        }
      />
      {zeilen.length === 0 ? (
        <EmptyState title={t.speakerVerlauf.overviewEmptyTitle} description={t.speakerVerlauf.overviewEmptyBody} />
      ) : (
        <VerlaufUebersicht
          zeilen={zeilen}
          arten={vgroup(vocab, "speaker_activity_kind")}
          dateLocale={t.meta.dateLocale}
          t={t.speakerVerlauf}
        />
      )}
    </>
  );
}
