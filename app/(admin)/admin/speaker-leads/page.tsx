import { notFound } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { LeadsView, type LeadRow, type UnassignedRow } from "./LeadsView";

export const dynamic = "force-dynamic";

/**
 * Speaker-Leads als Personen verwalten: wer ist Lead, wie viel trägt sie, und
 * welche Speaker haben noch niemanden.
 *
 * Die Rollenverwaltung unter „System" kann dasselbe — aber dort steht
 * `speaker_manager` zwischen dreissig anderen Rollen und ohne die Frage, wen
 * diese Person eigentlich betreut. Diese Seite stellt beides nebeneinander.
 */
export default async function SpeakerLeadsAdminPage() {
  await requireAdminSection("speakerLeads", "/admin/speaker-leads");
  const { locale, t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const { data: edition } = await supabase
    .from("event")
    .select("id")
    .eq("is_edition", true)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Ohne Edition gibt es nichts zuzuordnen; eine leere Seite mit drei
  // Auswahllisten wäre irreführender als „gibt es nicht".
  if (!edition) notFound();

  const [{ data: leads }, { data: unassigned }, vocab] = await Promise.all([
    supabase.rpc("speaker_leads_admin", { p_edition_id: edition.id }),
    supabase.rpc("unassigned_speakers", { p_edition_id: edition.id }),
    loadVocabMap(supabase, locale),
  ]);

  return (
    <>
      <PageHeader title={t.adminSpeakerLeads.title} description={t.adminSpeakerLeads.lead} />
      <LeadsView
        leads={(leads ?? []) as LeadRow[]}
        unassigned={(unassigned ?? []) as UnassignedRow[]}
        editionId={edition.id}
        labels={{
          role: vgroup(vocab, "role"),
          pipeline: vgroup(vocab, "speaker_pipeline"),
          speakerType: vgroup(vocab, "speaker_type"),
        }}
        t={t.adminSpeakerLeads}
        common={{ cancel: t.common.cancel, choose: t.common.choose, none: t.common.none }}
        rpcMessages={t.rpc}
      />
    </>
  );
}
