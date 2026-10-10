import { notFound } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { boardEvents } from "@/components/programme/events";
import { betreuteJeLead, buehnenUebersicht, type BoardZeile, type SpeakerZeile } from "@/lib/speaker/leads-uebersicht";
import { LeadsView, type LeadRow, type UnassignedRow } from "./LeadsView";

export const dynamic = "force-dynamic";

/**
 * Speaker-Leads als Personen verwalten: wer ist Lead, wie viel trägt sie, und
 * welche Speaker haben noch niemanden.
 *
 * Die Rollenverwaltung unter „System" kann dasselbe — aber dort steht
 * `speaker_manager` zwischen dreissig anderen Rollen und ohne die Frage, wen
 * diese Person eigentlich betreut. Diese Seite stellt beides nebeneinander.
 *
 * **ADM-068** (Konrad 05.10.: „teilweise noch etwas unklar“): zwei Fragen, die
 * die Seite jetzt getrennt beantwortet — **wer leitet welche Bühne** (die Tabelle
 * „Bühnen und Stage Leads“, mit Sessions und Speakern je Bühne, und der Zeile für
 * eine Bühne ohne Stage Lead) und **wen betreut wer** (je Lead-Person die Speaker,
 * die ihr zugeordnet sind). Gelesen wird, was es schon gibt: `manager_speakers`
 * und die Sicht `programme_board`; die Zusammensetzung steht in
 * `lib/speaker/leads-uebersicht.ts`.
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

  // PORT3: Stage Leads gelten je Bühne — zur Wahl stehen die Bühnen des Summits.
  const events = await boardEvents(supabase, [edition.id]);
  const [{ data: leads }, { data: unassigned }, vocab, { data: stageRows }, { data: speakerRows }, { data: boardRows }] = await Promise.all([
    supabase.rpc("speaker_leads_admin", { p_edition_id: edition.id }),
    supabase.rpc("unassigned_speakers", { p_edition_id: edition.id }),
    loadVocabMap(supabase, locale),
    events.length > 0
      ? supabase.from("stage").select("id, name").in("event_id", events.map((e) => e.id)).eq("active", true).order("sort_order")
      : Promise.resolve({ data: [] }),
    // ADM-068: alle Speaker der Edition mit ihrer Betreuung und die Slots des Summits — daraus die Listen je Lead und je Bühne.
    supabase.rpc("manager_speakers", { p_edition_id: edition.id }),
    events.length > 0
      ? supabase.from("programme_board").select("stage_id, session_id, speakers").in("event_id", events.map((e) => e.id))
      : Promise.resolve({ data: [] }),
  ]);
  const stages = (stageRows ?? []) as { id: string; name: string }[];
  const keinName = t.common.none;
  const buehnen = buehnenUebersicht(stages, (leads ?? []) as LeadRow[], (boardRows ?? []) as BoardZeile[], keinName);
  const betreute = betreuteJeLead((speakerRows ?? []) as SpeakerZeile[], keinName);

  return (
    <>
      <PageHeader word={t.admin.words.speakerLeads} title={t.adminSpeakerLeads.title} description={t.adminSpeakerLeads.lead} />
      <LeadsView
        leads={(leads ?? []) as LeadRow[]}
        unassigned={(unassigned ?? []) as UnassignedRow[]}
        stages={stages}
        buehnen={buehnen}
        betreute={betreute}
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
