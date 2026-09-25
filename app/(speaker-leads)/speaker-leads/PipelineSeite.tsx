import "server-only";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { boardEvents } from "@/components/programme/events";
import { PipelineView } from "./PipelineView";
import type { ManagedSpeaker, ManagerOption, ManagerScope, PipelineAnsicht } from "./types";

/**
 * Pipeline und Bestätigte Speaker (LEAD-028) — dieselben Daten, zwei Zuschnitte.
 * Beide Seiten laden über diese Komponente, damit sie nie auseinanderlaufen:
 * wer auf der Pipeline bestätigt wird, steht beim nächsten Laden bei den
 * Bestätigten, mit demselben Schubfach.
 */
export async function PipelineSeite({ ansicht, path }: { ansicht: PipelineAnsicht; path: string }) {
  await requireArea("speaker-leads", path);
  // Lead-Portal ist Deutsch zuerst (Arbeitsauftrag Welle 2, Abschnitt C) —
  // dieselbe Mechanik wie „Englisch zuerst" im Speaker-Portal, nur andersherum.
  const { locale, t } = await getI18n("de");
  const supabase = await createSupabaseServerClient();

  const { data: scopeJson } = await supabase.rpc("my_manager_scope");
  const scope = (scopeJson ?? null) as ManagerScope | null;

  // `requireArea` prüft die Rolle, `my_manager_scope` den tatsächlichen Scope.
  // Wer keiner ist, soll den Bereich auch nicht als leere Seite sehen.
  if (!scope?.is_manager) notFound();

  const [{ data: speakerRows }, { data: managerRows }, vocab] = await Promise.all([
    supabase.rpc("manager_speakers"),
    // Für die Übergabe: nur wer den Bereich auch öffnen kann, taugt als Empfänger.
    supabase.rpc("speaker_managers"),
    loadVocabMap(supabase, locale),
  ]);

  const speakers = (speakerRows ?? []) as ManagedSpeaker[];
  const managers = (managerRows ?? []) as ManagerOption[];

  // Bühnen in Frage (LEAD-039): die Bühnen des Summits der eigenen Editionen —
  // dieselbe Auswahl wie im Board (`boardEvents`, LEAD-014).
  const events = await boardEvents(supabase, scope.all ? [] : scope.editions.map((e) => e.id));
  const { data: stageRows } = events.length
    ? await supabase
        .from("stage")
        .select("id, name")
        .in("event_id", events.map((e) => e.id))
        .eq("active", true)
        .order("sort_order")
    : { data: [] };

  return (
    <>
      <PageHeader
        word={t.leads.wordLineup}
        title={ansicht === "pipeline" ? t.leads.title : t.leads.confirmedTitle}
        description={ansicht === "pipeline" ? t.leads.pipelineLead : t.leads.confirmedLead}
      />
      {speakers.length === 0 && scope.editions.length === 0 && !scope.all ? (
        <EmptyState title={t.leads.emptyScopeTitle} description={t.leads.emptyScopeBody} />
      ) : (
        <PipelineView
          ansicht={ansicht}
          scope={scope}
          speakers={speakers}
          managers={managers}
          labels={{
            pipeline: vgroup(vocab, "speaker_pipeline"),
            speakerType: vgroup(vocab, "speaker_type"),
            hospitality: vgroup(vocab, "hospitality_status"),
            hotelTier: vgroup(vocab, "hotel_tier"),
            passType: vgroup(vocab, "ticket_type"),
            declineReason: vgroup(vocab, "speaker_decline_reason"),
            publishStatus: vgroup(vocab, "publish_status"),
          }}
          einordnungOptionen={{
            category: vgroup(vocab, "speaker_category"),
            topic_cluster: vgroup(vocab, "topic_cluster"),
            priority: vgroup(vocab, "speaker_priority"),
            recommended_format: vgroup(vocab, "session_format"),
            outreach_channel: vgroup(vocab, "outreach_channel"),
            stages: ((stageRows ?? []) as { id: string; name: string }[]).map((st) => ({
              value: st.id,
              label: st.name,
            })),
          }}
          te={t.speakerEinordnung}
          verlaufArten={vgroup(vocab, "speaker_activity_kind")}
          tv={t.speakerVerlauf}
          tg={t.speakerGast}
          locale={locale}
          dateLocale={t.meta.dateLocale}
          t={t.leads}
          common={{
            cancel: t.common.cancel,
            choose: t.common.choose,
            close: t.common.close,
            none: t.common.none,
            required: t.common.required,
            save: t.common.save,
          }}
          rpcMessages={t.rpc}
        />
      )}
    </>
  );
}
